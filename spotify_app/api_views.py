from rest_framework import permissions, viewsets
from rest_framework.authentication import TokenAuthentication

from .serializers import (
    SpotifyHistorySerializer,
    SpotifyUserTokenSerializer,
    SpotifyAppTokenSerializer,
    TrackSerializer,
    PlaylistEntrySerializer,
    VoteSerializer,
    RatingSerializer,
    PendingAuthSerializer,
    EphemeralSessionSerializer,
    CurrentTrackSerializer,
    GroupPlaylistSerializer,
    PendingVoteSessionSerializer,
)

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


class BaseAuthMixin:
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]


class SpotifyHistoryViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = SpotifyHistorySerializer
    queryset = SpotifyHistory.objects.all()


class SpotifyUserTokenViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = SpotifyUserTokenSerializer
    queryset = SpotifyUserToken.objects.all()


class SpotifyAppTokenViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = SpotifyAppTokenSerializer
    queryset = SpotifyAppToken.objects.all()


class TrackViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = TrackSerializer
    queryset = Track.objects.all()


class PlaylistEntryViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = PlaylistEntrySerializer
    queryset = PlaylistEntry.objects.all()


class VoteViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = VoteSerializer
    queryset = Vote.objects.all()


class RatingViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = RatingSerializer
    queryset = Rating.objects.all()


class PendingAuthViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = PendingAuthSerializer
    queryset = PendingAuth.objects.all()


class EphemeralSessionViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = EphemeralSessionSerializer
    queryset = EphemeralSession.objects.all()


class CurrentTrackViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = CurrentTrackSerializer
    queryset = CurrentTrack.objects.all()


class GroupPlaylistViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = GroupPlaylistSerializer
    queryset = GroupPlaylist.objects.all()


class PendingVoteSessionViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = PendingVoteSessionSerializer
    queryset = PendingVoteSession.objects.all()
