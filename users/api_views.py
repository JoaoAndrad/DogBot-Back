from rest_framework import permissions, viewsets
from rest_framework.authentication import TokenAuthentication

from .serializers import UserProfileSerializer


class BaseAuthMixin:
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]


class UserProfileViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = UserProfileSerializer

    def get_queryset(self):
        from .models import UserProfile

        return UserProfile.objects.all().order_by("-created_at")
