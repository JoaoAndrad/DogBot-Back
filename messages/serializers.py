from rest_framework import serializers
from .models import Identifier, Message, MessageEvent
from users.models import UserProfile


class IdentifierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Identifier
        fields = ["id", "user", "identifier", "type", "observed_from", "observed_at"]


class UserProfileSerializer(serializers.ModelSerializer):
    identifiers = IdentifierSerializer(many=True, read_only=True)

    class Meta:
        model = UserProfile
        fields = ["id", "name", "last_push_name", "push_name_history", "meta", "identifiers", "last_seen", "created_at"]


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = [
            "id",
            "message_id",
            "user",
            "chat_id",
            "from_id",
            "display_name",
            "is_group",
            "body",
            "snippet",
            "has_media",
            "media_meta",
            "quoted_message_id",
            "msg_type",
            "received_at",
            "processed",
            "origin",
            "meta",
            "raw",
        ]


class MessageEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageEvent
        fields = ["id", "message", "event_type", "payload", "created_at"]
