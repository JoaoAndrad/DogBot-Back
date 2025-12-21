from rest_framework import permissions, viewsets
from rest_framework.authentication import TokenAuthentication

from .serializers import SpotifyHistorySerializer


class BaseAuthMixin:
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]


class SpotifyHistoryViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = SpotifyHistorySerializer

    def get_queryset(self):
        from .models import SpotifyHistory

        return SpotifyHistory.objects.all()
