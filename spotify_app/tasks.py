"""
Background tasks for Spotify app.
Handles token refresh, poll expiry monitoring, and current track polling.
"""
import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone

from .models import SpotifyUserToken, SpotifyAppToken, PendingVoteSession, CurrentTrack
from .handlers import expire_poll

logger = logging.getLogger(__name__)


def refresh_spotify_tokens(dry_run=False):
    """
    Refresh Spotify user tokens that are expiring soon (within 5 minutes).
    Should be run periodically (e.g., every 5 minutes via cron or Celery).

    Args:
        dry_run (bool): If True, log actions without persisting changes

    Returns:
        dict: {'refreshed': int, 'errors': list}
    """
    threshold = timezone.now() + timedelta(minutes=5)
    expiring_tokens = SpotifyUserToken.objects.filter(
        expires_at__lte=threshold,
        refresh_token__isnull=False,
    ).exclude(refresh_token='')

    logger.info(f"Found {expiring_tokens.count()} tokens to refresh (dry_run={dry_run})")

    refreshed = 0
    errors = []

    for token in expiring_tokens:
        try:
            if refresh_user_token(token, dry_run=dry_run):
                refreshed += 1
        except Exception as e:
            logger.error(f"Failed to refresh token for user {token.user.wa_id}: {e}")
            errors.append({'user': token.user.wa_id, 'error': str(e)})

    return {'refreshed': refreshed, 'errors': errors}


def refresh_user_token(token: SpotifyUserToken, dry_run=False) -> bool:
    """
    Refresh a single Spotify user token.

    Args:
        token: SpotifyUserToken instance
        dry_run: If True, don't save changes

    Returns:
        bool: True if successful, False otherwise
    """
    if not token.refresh_token:
        logger.warning(f"No refresh token for user {token.user.wa_id}")
        return False

    # Get client credentials
    app_token = SpotifyAppToken.objects.first()
    client_id = getattr(settings, 'SPOTIFY_CLIENT_ID', None)
    client_secret = getattr(settings, 'SPOTIFY_CLIENT_SECRET', None)

    if app_token:
        client_id = client_id or app_token.client_id
        client_secret = client_secret or app_token.client_secret

    if not client_id:
        logger.error("SPOTIFY_CLIENT_ID not configured")
        return False

    # Prepare refresh request
    token_url = "https://accounts.spotify.com/api/token"
    data = {
        'grant_type': 'refresh_token',
        'refresh_token': token.refresh_token,
    }

    auth = None
    if client_secret:
        auth = (client_id, data)
        data['client_id'] = client_id

    try:
        response = requests.post(token_url, data=data, auth=auth, timeout=10)

        if response.status_code != 200:
            logger.error(f"Token refresh failed for {token.user.wa_id}: {response.status_code} - {response.text}")
            return False

        token_data = response.json()

        # Update token
        token.access_token = token_data.get('access_token')
        new_refresh = token_data.get('refresh_token')
        if new_refresh:
            token.refresh_token = new_refresh

        expires_in = token_data.get('expires_in', 3600)
        token.expires_at = timezone.now() + timedelta(seconds=expires_in)
        token.last_refreshed_at = timezone.now()

        if not dry_run:
            token.save()

        logger.info(f"Successfully refreshed token for user {token.user.wa_id} (dry_run={dry_run})")
        return True

    except requests.RequestException as e:
        logger.error(f"Network error refreshing token for {token.user.wa_id}: {e}")
        return False


def check_expired_polls(dry_run=False):
    """
    Check for active polls that have expired and resolve them.
    Should be run periodically (e.g., every 5 minutes).

    Args:
        dry_run (bool): If True, log actions without persisting changes

    Returns:
        dict: {'expired': int, 'approved': int, 'rejected': int}
    """
    expired_sessions = PendingVoteSession.objects.filter(
        state='active',
        expires_at__lte=timezone.now()
    )

    logger.info(f"Found {expired_sessions.count()} expired polls to process (dry_run={dry_run})")

    expired = 0
    approved = 0
    rejected = 0

    for session in expired_sessions:
        try:
            result = expire_poll(session, dry_run=dry_run)

            track_name = session.playlist_entry.track.name if session.playlist_entry.track else "Unknown"

            expired += 1
            if result.get('approved'):
                approved += 1
                logger.info(f"Poll {session.id} expired and approved: {track_name} (dry_run={dry_run})")
                # TODO: Send WhatsApp notification about approval
                # TODO: Trigger add_to_spotify job
            else:
                rejected += 1
                logger.info(f"Poll {session.id} expired and rejected: {track_name} (dry_run={dry_run})")
                # TODO: Send WhatsApp notification about rejection

        except Exception as e:
            logger.error(f"Failed to expire poll {session.id}: {e}")

    return {'expired': expired, 'approved': approved, 'rejected': rejected}


def poll_current_tracks(dry_run=False):
    """
    Poll Spotify API to update what users are currently listening to.
    Should be run periodically (e.g., every 30 seconds to 1 minute).

    Args:
        dry_run (bool): If True, log actions without persisting changes

    Returns:
        dict: {'updated': int, 'errors': list}

    Note: This requires valid user tokens and proper Spotify API scopes
    (user-read-currently-playing, user-read-playback-state).
    """
    active_tokens = SpotifyUserToken.objects.filter(
        expires_at__gt=timezone.now(),
        access_token__isnull=False,
    ).exclude(access_token='')

    logger.debug(f"Polling {active_tokens.count()} active users for current tracks (dry_run={dry_run})")

    updated = 0
    errors = []

    for token in active_tokens:
        try:
            if poll_user_current_track(token, dry_run=dry_run):
                updated += 1
        except Exception as e:
            logger.error(f"Failed to poll current track for {token.user.wa_id}: {e}")
            errors.append({'user': token.user.wa_id, 'error': str(e)})

    return {'updated': updated, 'errors': errors}


def poll_user_current_track(token: SpotifyUserToken, dry_run=False) -> bool:
    """
    Poll current track for a single user and update CurrentTrack model.

    Args:
        token: SpotifyUserToken instance
        dry_run: If True, don't save changes

    Returns:
        bool: True if track was updated, False otherwise
    """
    url = "https://api.spotify.com/v1/me/player/currently-playing"
    headers = {'Authorization': f'Bearer {token.access_token}'}

    try:
        response = requests.get(url, headers=headers, timeout=5)

        if response.status_code == 204:
            # Nothing playing - clear current track
            if not dry_run:
                CurrentTrack.objects.filter(user=token.user).delete()
            logger.debug(f"No track playing for {token.user.wa_id} (dry_run={dry_run})")
            return False

        if response.status_code != 200:
            logger.warning(f"Failed to get current track for {token.user.wa_id}: {response.status_code}")
            return

        data = response.json()

        if not data or not data.get('item'):
            # Nothing playing
            if not dry_run:
                CurrentTrack.objects.filter(user=token.user).delete()
            return False

        item = data['item']
        track_id = item.get('id')
        track_name = item.get('name')
        progress_ms = data.get('progress_ms', 0)
        duration_ms = item.get('duration_ms', 0)
        is_playing = data.get('is_playing', False)

        if not is_playing:
            # Paused - optionally clear or keep
            return False

        # Update or create CurrentTrack
        from .models import Track

        # Try to get or create track
        track_obj = None
        if track_id and not dry_run:
            track_obj, _ = Track.objects.get_or_create(
                id=track_id,
                defaults={
                    'name': track_name,
                    'artists': ', '.join([a['name'] for a in item.get('artists', [])]),
                    'album': item.get('album', {}).get('name', ''),
                    'duration_ms': duration_ms,
                    'url': item.get('external_urls', {}).get('spotify', ''),
                    'image_url': item.get('album', {}).get('images', [{}])[0].get('url', '') if item.get('album', {}).get('images') else '',
                }
            )

            CurrentTrack.objects.update_or_create(
                user=token.user,
                defaults={
                    'track': track_obj,
                    'start_time': timezone.now() - timedelta(milliseconds=progress_ms),
                    'total_ms': duration_ms,
                }
            )

        logger.debug(f"Updated current track for {token.user.wa_id}: {track_name} (dry_run={dry_run})")
        return True

    except requests.RequestException as e:
        logger.error(f"Network error polling current track for {token.user.wa_id}: {e}")


# Celery task definitions (optional - uncomment if using Celery)
"""
from celery import shared_task

@shared_task
def refresh_spotify_tokens_task():
    refresh_spotify_tokens()

@shared_task
def check_expired_polls_task():
    check_expired_polls()

@shared_task
def poll_current_tracks_task():
    poll_current_tracks()
"""


# Django management command alternative (create as management/commands/spotify_jobs.py)
"""
from django.core.management.base import BaseCommand
from spotify_app.tasks import refresh_spotify_tokens, check_expired_polls, poll_current_tracks

class Command(BaseCommand):
    help = 'Run Spotify background jobs'

    def add_arguments(self, parser):
        parser.add_argument('job', type=str, help='Job to run: refresh_tokens, expire_polls, poll_tracks, all')

    def handle(self, *args, **options):
        job = options['job']

        if job == 'refresh_tokens' or job == 'all':
            self.stdout.write('Running token refresh...')
            refresh_spotify_tokens()

        if job == 'expire_polls' or job == 'all':
            self.stdout.write('Checking expired polls...')
            check_expired_polls()

        if job == 'poll_tracks' or job == 'all':
            self.stdout.write('Polling current tracks...')
            poll_current_tracks()

        self.stdout.write(self.style.SUCCESS('Done!'))
"""
