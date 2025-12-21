from django.db import models

from users.models import UserProfile


class SpotifyHistory(models.Model):
    user = models.ForeignKey(
        UserProfile, on_delete=models.CASCADE, related_name="spotify_history"
    )
    track_id = models.CharField(max_length=255, blank=True, null=True)
    track_name = models.CharField(max_length=1024, blank=True, null=True)
    artists = models.CharField(max_length=1024, blank=True, null=True)
    played_at = models.DateTimeField(blank=True, null=True)
    raw = models.JSONField(blank=True, null=True)

    class Meta:
        ordering = ["-played_at"]

    def __str__(self):
        return f"{self.track_name} ({self.artists})"

import uuid


class SpotifyUserToken(models.Model):
    user = models.OneToOneField(
        UserProfile, on_delete=models.CASCADE, related_name="spotify_token"
    )
    spotify_user_id = models.CharField(max_length=255, blank=True, null=True)
    access_token = models.TextField(blank=True, null=True)
    refresh_token = models.TextField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    scope = models.TextField(blank=True, null=True)
    connected_at = models.DateTimeField(blank=True, null=True)
    last_refreshed_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"SpotifyToken({self.user})"


class SpotifyAppToken(models.Model):
    client_id = models.CharField(max_length=255)
    client_secret = models.TextField(blank=True, null=True)
    redirect_uri = models.CharField(max_length=1024, blank=True, null=True)
    access_token = models.TextField(blank=True, null=True)
    refresh_token = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SpotifyAppToken({self.client_id})"


class Track(models.Model):
    id = models.CharField(max_length=128, primary_key=True)
    url = models.CharField(max_length=1024, blank=True, null=True)
    name = models.CharField(max_length=1024, blank=True, null=True)
    artists = models.CharField(max_length=1024, blank=True, null=True)
    album = models.CharField(max_length=1024, blank=True, null=True)
    image_url = models.CharField(max_length=1024, blank=True, null=True)
    duration_ms = models.IntegerField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} - {self.artists}"


class PlaylistEntry(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("added", "Added"),
        ("failed", "Failed"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    playlist_id = models.CharField(max_length=255, default="default")
    track = models.ForeignKey(Track, on_delete=models.SET_NULL, null=True, blank=True)
    track_url = models.CharField(max_length=1024, blank=True, null=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="pending")
    added_by = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)
    attempts = models.IntegerField(default=0)

    def __str__(self):
        return f"PlaylistEntry({self.playlist_id} - {self.track or self.track_url})"


class Vote(models.Model):
    VOTE_TYPES = [("skip", "Skip"), ("approval", "Approval"), ("note", "Note")]

    track = models.ForeignKey(Track, on_delete=models.CASCADE, null=True, blank=True)
    vote_type = models.CharField(max_length=32, choices=VOTE_TYPES)
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    value = models.FloatField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Vote({self.track} by {self.user} = {self.vote_type})"


class Rating(models.Model):
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    rating = models.DecimalField(max_digits=3, decimal_places=1)
    timestamp = models.DateTimeField(auto_now_add=True)
    is_latest = models.BooleanField(default=True)

    def __str__(self):
        return f"Rating({self.track} by {self.user} = {self.rating})"


class PendingAuth(models.Model):
    user = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    state = models.CharField(max_length=255)
    code_verifier = models.CharField(max_length=1024, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"PendingAuth({self.user} - {self.state})"


class EphemeralSession(models.Model):
    session_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    payload = models.JSONField(blank=True, null=True)
    type = models.CharField(max_length=64, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"EphemeralSession({self.session_id})"


class CurrentTrack(models.Model):
    user = models.OneToOneField(UserProfile, on_delete=models.CASCADE, primary_key=True)
    track = models.ForeignKey(Track, on_delete=models.SET_NULL, null=True, blank=True)
    start_time = models.DateTimeField(blank=True, null=True)
    total_ms = models.BigIntegerField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"CurrentTrack({self.user} -> {self.track})"


class GroupPlaylist(models.Model):
    """Maps a group chat to a Spotify playlist."""
    group_chat_id = models.CharField(max_length=128, unique=True)
    playlist_id = models.CharField(max_length=255)
    playlist_name = models.CharField(max_length=512, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"GroupPlaylist({self.group_chat_id} -> {self.playlist_id})"


class PendingVoteSession(models.Model):
    """Represents a poll session for approving a PlaylistEntry."""
    STATE_CHOICES = [
        ("active", "Active"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("expired", "Expired"),
    ]

    playlist_entry = models.ForeignKey(PlaylistEntry, on_delete=models.CASCADE, related_name="vote_sessions")
    eligible_voters = models.JSONField(default=list)
    created_by = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    state = models.CharField(max_length=32, choices=STATE_CHOICES, default="active")
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    threshold_type = models.CharField(max_length=32, default="fixed")  # fixed, percentage, hybrid
    threshold_value = models.IntegerField(default=3)

    def __str__(self):
        return f"PendingVoteSession({self.playlist_entry} - {self.state})"
