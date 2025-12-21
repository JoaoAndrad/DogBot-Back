from rest_framework import permissions, viewsets
from rest_framework.authentication import TokenAuthentication

from .models import SpotifyHistory, TrainingHistory, UserProfile
from .serializers import (SpotifyHistorySerializer, TrainingHistorySerializer,
                          UserProfileSerializer)


class BaseAuthMixin:
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]


class UserProfileViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    queryset = UserProfile.objects.all().order_by("-created_at")
    serializer_class = UserProfileSerializer


class SpotifyHistoryViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    queryset = SpotifyHistory.objects.all()
    serializer_class = SpotifyHistorySerializer


class TrainingHistoryViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    queryset = TrainingHistory.objects.all()
    serializer_class = TrainingHistorySerializer
