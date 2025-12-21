import os
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Identifier, Message, MessageEvent
from users.models import UserProfile
from .serializers import MessageSerializer, UserProfileSerializer


def _has_internal_secret(request):
    secret = os.environ.get("POLL_SHARED_SECRET")
    if not secret:
        return False
    header = request.META.get("HTTP_X_INTERNAL_SECRET")
    return header == secret


class MessageCreateAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not request.user.is_authenticated and not _has_internal_secret(request):
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

        data = request.data.copy()
        # require message_id
        message_id = data.get("message_id") or data.get("msgId")
        if not message_id:
            return Response({"detail": "message_id required"}, status=status.HTTP_400_BAD_REQUEST)

        # idempotent: if exists, update minimal fields
        msg_obj = Message.objects.filter(message_id=message_id).first()
        if msg_obj:
            serializer = MessageSerializer(msg_obj, data=data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        # create new
        data.setdefault("received_at", timezone.now())
        serializer = MessageSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        msg = serializer.save()

        # try to resolve identifier -> user
        try:
            from_id = data.get("from_id") or data.get("from")
            if from_id:
                ident = Identifier.objects.filter(identifier=from_id).first()
                if ident and ident.user:
                    msg.user = ident.user
                    msg.save()
        except Exception:
            pass

        return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)


class MessageRawCreateAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, message_id):
        if not request.user.is_authenticated and not _has_internal_secret(request):
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

        msg = get_object_or_404(Message, message_id=message_id)
        # accept raw payload and store
        raw = request.data.copy()
        msg.raw = raw
        msg.save()
        return Response(MessageSerializer(msg).data, status=status.HTTP_200_OK)
