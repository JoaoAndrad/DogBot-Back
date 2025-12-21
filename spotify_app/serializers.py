from rest_framework import serializers

from .models import (
    SpotifyHistory,
    SpotifyUserToken,
    SpotifyAppToken,
    Track,
    PlaylistEntry,
    Vote,
    Rating,
    PendingAuth,
    EphemeralSession,
    CurrentTrack,
    GroupPlaylist,
    PendingVoteSession,
)


class SpotifyHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SpotifyHistory
        fields = [
            "id",
            "user",
            "track_id",
            "track_name",
            "artists",
            "played_at",
            "raw",
        ]


class SpotifyUserTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpotifyUserToken
        fields = [
            "id",
            "user",
            "spotify_user_id",
            "access_token",
            "refresh_token",
            "expires_at",
            "scope",
            "connected_at",
            "last_refreshed_at",
        ]


class SpotifyAppTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpotifyAppToken
        fields = [
            "id",
            "client_id",
            "client_secret",
            "redirect_uri",
            "access_token",
            "refresh_token",
            "updated_at",
        ]


class TrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Track
        fields = ["id", "url", "name", "artists", "album", "image_url", "duration_ms"]


class PlaylistEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = PlaylistEntry
        fields = [
            "id",
            "playlist_id",
            "track",
            "track_url",
            "status",
            "added_by",
            "added_at",
            "attempts",
        ]


class VoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vote
        fields = ["id", "track", "vote_type", "user", "value", "created_at"]


class RatingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rating
        fields = ["id", "track", "user", "rating", "timestamp", "is_latest"]


class PendingAuthSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingAuth
        fields = ["id", "user", "state", "code_verifier", "created_at", "expires_at"]


class EphemeralSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EphemeralSession
        fields = ["session_id", "user", "payload", "type", "created_at", "expires_at"]


class CurrentTrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = CurrentTrack
        fields = ["user", "track", "start_time", "total_ms", "updated_at"]


class GroupPlaylistSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupPlaylist
        fields = ["id", "group_chat_id", "playlist_id", "playlist_name", "created_at", "updated_at"]


class PendingVoteSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingVoteSession
        fields = [
            "id",
            "playlist_entry",
            "eligible_voters",
            "created_by",
            "state",
            "expires_at",
            "created_at",
            "threshold_type",
            "threshold_value",
        ]
