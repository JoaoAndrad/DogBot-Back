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
