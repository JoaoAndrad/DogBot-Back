from django.urls import include, path
from rest_framework import routers


from .api_views import (
    SpotifyHistoryViewSet,
    SpotifyUserTokenViewSet,
    SpotifyAppTokenViewSet,
    TrackViewSet,
    PlaylistEntryViewSet,
    VoteViewSet,
    RatingViewSet,
    PendingAuthViewSet,
    EphemeralSessionViewSet,
    CurrentTrackViewSet,
    GroupPlaylistViewSet,
    PendingVoteSessionViewSet,
)

router = routers.DefaultRouter()
router.register(r"history", SpotifyHistoryViewSet, basename="spotify-history")
router.register(r"tokens", SpotifyUserTokenViewSet, basename="spotify-user-token")
router.register(r"app-tokens", SpotifyAppTokenViewSet, basename="spotify-app-token")
router.register(r"tracks", TrackViewSet, basename="spotify-track")
router.register(r"playlist-entries", PlaylistEntryViewSet, basename="spotify-playlist-entry")
router.register(r"votes", VoteViewSet, basename="spotify-vote")
router.register(r"ratings", RatingViewSet, basename="spotify-rating")
router.register(r"pending-auths", PendingAuthViewSet, basename="spotify-pending-auth")
router.register(r"sessions", EphemeralSessionViewSet, basename="spotify-session")
router.register(r"current-tracks", CurrentTrackViewSet, basename="spotify-current-track")
router.register(r"group-playlists", GroupPlaylistViewSet, basename="spotify-group-playlist")
router.register(r"vote-sessions", PendingVoteSessionViewSet, basename="spotify-vote-session")

from . import views as spotify_views

urlpatterns = [
    path("auth/start/", spotify_views.SpotifyAuthStartView.as_view(), name="spotify-auth-start"),
    path("auth/callback/", spotify_views.SpotifyAuthCallbackView.as_view(), name="spotify-auth-callback"),
    path("", include(router.urls)),
]
# keep single urlpatterns (do not override)
