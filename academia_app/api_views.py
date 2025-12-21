from rest_framework import permissions, viewsets
from rest_framework.authentication import TokenAuthentication

from .serializers import TrainingHistorySerializer


class BaseAuthMixin:
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]


class TrainingHistoryViewSet(BaseAuthMixin, viewsets.ModelViewSet):
    serializer_class = TrainingHistorySerializer

    def get_queryset(self):
        from .models import TrainingHistory

        return TrainingHistory.objects.all()
