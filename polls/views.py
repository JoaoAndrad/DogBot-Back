import os

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Poll
from .serializers import PollSerializer, VoteSerializer


def _has_internal_secret(request):
    secret = os.environ.get("POLL_SHARED_SECRET")
    if not secret:
        return False
    header = request.META.get("HTTP_X_INTERNAL_SECRET")
    return header == secret


class PollListCreateAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        chat_id = request.query_params.get("chat_id")
        qs = Poll.objects.all().order_by("-created_at")
        if chat_id:
            qs = qs.filter(chat_id=chat_id)
        serializer = PollSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        # allow either authenticated or internal secret
        if not request.user.is_authenticated and not _has_internal_secret(request):
            return Response(
                {"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED
            )

        data = request.data.copy()
        # require id (msg id) for deterministic storage
        if "id" not in data and "msgId" in data:
            data["id"] = data.pop("msgId")
        serializer = PollSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PollDetailAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, msg_id):
        poll = get_object_or_404(Poll, pk=msg_id)
        serializer = PollSerializer(poll)
        return Response(serializer.data)

    def delete(self, request, msg_id):
        if not request.user.is_authenticated and not _has_internal_secret(request):
            return Response(
                {"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED
            )
        poll = get_object_or_404(Poll, pk=msg_id)
        poll.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VoteCreateAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, msg_id):
        if not request.user.is_authenticated and not _has_internal_secret(request):
            return Response(
                {"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED
            )

        poll = get_object_or_404(Poll, pk=msg_id)
        data = request.data.copy()
        data["poll"] = poll.id
        serializer = VoteSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        vote = serializer.save()
        return Response(VoteSerializer(vote).data, status=status.HTTP_201_CREATED)
