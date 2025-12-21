"""
Backend handlers for Spotify business logic.
Orchestrates poll creation, vote counting, threshold application, and Spotify API calls.
"""
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional

from django.db.models import Count, Q
from django.utils import timezone

from .models import (
    GroupPlaylist,
    PlaylistEntry,
    PendingVoteSession,
    Vote,
    Track,
    SpotifyUserToken,
    CurrentTrack,
)
from users.models import UserProfile


def get_group_playlist(group_chat_id: str) -> Optional[GroupPlaylist]:
    """Retrieve the playlist associated with a group."""
    try:
        return GroupPlaylist.objects.get(group_chat_id=group_chat_id)
    except GroupPlaylist.DoesNotExist:
        return None


def get_eligible_voters(group_chat_id: str) -> List[str]:
    """Get list of user IDs who have valid Spotify tokens in the group."""
    # This would need actual group membership data - stub for now
    # In production: query group members and filter by SpotifyUserToken existence
    tokens = SpotifyUserToken.objects.filter(
        expires_at__gt=timezone.now()
    ).values_list('user__wa_id', flat=True)
    return list(tokens)


def get_users_listening_to_track(track_id: str, eligible_voters: List[str]) -> List[str]:
    """Check which eligible voters are currently listening to the given track."""
    current = CurrentTrack.objects.filter(
        track_id=track_id,
        user__wa_id__in=eligible_voters
    ).values_list('user__wa_id', flat=True)
    return list(current)


def normalize_track_input(input_str: str) -> Optional[str]:
    """
    Extract Spotify track_id from URL or return input if already a track ID.
    Examples:
      - https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6 -> 6rqhFgbbKwnb9MLmUQDhG6
      - spotify:track:6rqhFgbbKwnb9MLmUQDhG6 -> 6rqhFgbbKwnb9MLmUQDhG6
    """
    # Match open.spotify.com/track/{id}
    match = re.search(r'open\.spotify\.com/track/([a-zA-Z0-9]+)', input_str)
    if match:
        return match.group(1)
    # Match spotify:track:{id}
    match = re.search(r'spotify:track:([a-zA-Z0-9]+)', input_str)
    if match:
        return match.group(1)
    # Assume it's already a track ID
    if re.match(r'^[a-zA-Z0-9]+$', input_str):
        return input_str
    return None


def create_poll(
    track_id: str,
    group_chat_id: str,
    created_by: UserProfile,
    eligible_voters: List[str],
    timeout_hours: int = 2,
    threshold_type: str = "fixed",
    threshold_value: int = 3,
) -> Optional[PendingVoteSession]:
    """
    Create a poll for a track suggestion.

    Steps:
    1. Check if playlist entry already exists.
    2. Create PlaylistEntry if needed.
    3. Create PendingVoteSession.
    4. Return session for caller to send WhatsApp message.
    """
    group_playlist = get_group_playlist(group_chat_id)
    if not group_playlist:
        return None  # No playlist assigned to group

    # Check if track already in playlist
    existing = PlaylistEntry.objects.filter(
        playlist_id=group_playlist.playlist_id,
        track_id=track_id
    ).exclude(status='rejected').first()

    if existing:
        if existing.status in ['added', 'approved']:
            return None  # Already in playlist
        # If pending, reuse or create new session
        entry = existing
    else:
        # Create new entry
        entry = PlaylistEntry.objects.create(
            playlist_id=group_playlist.playlist_id,
            track_id=track_id,
            status='pending',
            added_by=created_by,
        )

    # Create poll session
    expires_at = timezone.now() + timedelta(hours=timeout_hours)
    session = PendingVoteSession.objects.create(
        playlist_entry=entry,
        eligible_voters=eligible_voters,
        created_by=created_by,
        state='active',
        expires_at=expires_at,
        threshold_type=threshold_type,
        threshold_value=threshold_value,
    )

    return session


def process_vote(
    session_id: int,
    user: UserProfile,
    vote_value: str,  # 'yes' or 'no'
) -> Dict[str, any]:
    """
    Process a vote from a user.

    Returns dict with: success (bool), message (str), session_state (str)
    """
    try:
        session = PendingVoteSession.objects.get(id=session_id, state='active')
    except PendingVoteSession.DoesNotExist:
        return {'success': False, 'message': 'Poll not found or expired', 'session_state': None}

    # Check if user is eligible
    if user.wa_id not in session.eligible_voters:
        return {'success': False, 'message': 'You are not eligible to vote', 'session_state': session.state}

    # Create or update vote
    vote_type = 'approval' if vote_value.lower() == 'yes' else 'skip'
    Vote.objects.update_or_create(
        track=session.playlist_entry.track,
        user=user,
        defaults={'vote_type': vote_type}
    )

    # Check if threshold met
    result = apply_vote_threshold(session)

    return {
        'success': True,
        'message': 'Vote recorded',
        'session_state': session.state,
        'threshold_result': result,
    }


def apply_vote_threshold(session: PendingVoteSession) -> Dict[str, any]:
    """
    Check if vote threshold is met and update session/entry state.

    Returns dict with: approved (bool), rejected (bool), pending (bool), counts
    """
    entry = session.playlist_entry

    # Count votes
    votes = Vote.objects.filter(track=entry.track, user__wa_id__in=session.eligible_voters)
    yes_votes = votes.filter(vote_type='approval').count()
    no_votes = votes.filter(vote_type='skip').count()
    total_eligible = len(session.eligible_voters)

    approved = False
    rejected = False

    if session.threshold_type == 'fixed':
        # Fixed number of yes votes
        if yes_votes >= session.threshold_value:
            approved = True
    elif session.threshold_type == 'percentage':
        # Percentage of eligible voters
        if total_eligible > 0 and (yes_votes / total_eligible) >= (session.threshold_value / 100):
            approved = True
    elif session.threshold_type == 'hybrid':
        # Fixed OR percentage
        if yes_votes >= session.threshold_value or (total_eligible > 0 and (yes_votes / total_eligible) >= 0.5):
            approved = True

    # Check for rejection (optional: if no_votes exceed threshold)
    # For now, we only approve, rejection happens on timeout

    if approved:
        session.state = 'approved'
        session.save()
        entry.status = 'approved'
        entry.save()
        return {
            'approved': True,
            'rejected': False,
            'pending': False,
            'yes_votes': yes_votes,
            'no_votes': no_votes,
            'total_eligible': total_eligible,
        }

    return {
        'approved': False,
        'rejected': False,
        'pending': True,
        'yes_votes': yes_votes,
        'no_votes': no_votes,
        'total_eligible': total_eligible,
    }


def expire_poll(session: PendingVoteSession, dry_run=False) -> Dict[str, any]:
    """
    Expire a poll and apply final decision.
    Called by background job when expires_at is reached.

    Args:
        session: PendingVoteSession instance
        dry_run: If True, don't save changes
    """
    if session.state != 'active':
        return {'already_resolved': True}

    result = apply_vote_threshold(session)

    if not result['approved']:
        # Not enough votes - mark as rejected
        if not dry_run:
            session.state = 'expired'
            session.save()
            session.playlist_entry.status = 'rejected'
            session.playlist_entry.save()
        return {'expired': True, 'rejected': True, 'result': result}

    return {'expired': True, 'approved': result['approved'], 'result': result}


def handle_vote_command(
    track_input: str,
    group_chat_id: str,
    sender: UserProfile,
) -> Dict[str, any]:
    """
    Main handler for /voto command.

    Returns dict with: success, message, poll_session (if created), error
    """
    # 1. Check if group has playlist
    group_playlist = get_group_playlist(group_chat_id)
    if not group_playlist:
        return {
            'success': False,
            'message': 'Este grupo não tem uma playlist atribuída.',
            'poll_session': None,
        }

    # 2. Normalize track input
    track_id = normalize_track_input(track_input)
    if not track_id:
        return {
            'success': False,
            'message': 'Não foi possível identificar a música. Use um link do Spotify ou track ID.',
            'poll_session': None,
        }

    # 3. Get eligible voters
    eligible_voters = get_eligible_voters(group_chat_id)
    if len(eligible_voters) < 2:
        return {
            'success': False,
            'message': 'Não há usuários suficientes conectados ao Spotify neste grupo.',
            'poll_session': None,
        }

    # 4. Check if multiple users are listening to this track
    listening = get_users_listening_to_track(track_id, eligible_voters)
    if len(listening) < 1:
        return {
            'success': False,
            'message': 'Nenhum usuário está ouvindo essa música no momento.',
            'poll_session': None,
        }

    # 5. Create poll
    session = create_poll(
        track_id=track_id,
        group_chat_id=group_chat_id,
        created_by=sender,
        eligible_voters=eligible_voters,
        timeout_hours=2,
        threshold_type='fixed',
        threshold_value=3,
    )

    if not session:
        return {
            'success': False,
            'message': 'Esta música já está na playlist ou foi rejeitada.',
            'poll_session': None,
        }

    return {
        'success': True,
        'message': 'Votação criada! Aguardando votos.',
        'poll_session': session,
        'eligible_voters': eligible_voters,
        'listening': listening,
    }
