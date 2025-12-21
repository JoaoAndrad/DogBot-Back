from rest_framework import serializers

from .models import Poll, Vote


class PollSerializer(serializers.ModelSerializer):
    class Meta:
        model = Poll
        fields = [
            "id",
            "chat_id",
            "title",
            "options",
            "poll_options",
            "options_obj",
            "type",
            "created_at",
        ]


class VoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vote
        fields = [
            "id",
            "poll",
            "voter_id",
            "selected_options",
            "selected_indexes",
            "selected_names",
            "ts",
        ]
        read_only_fields = ["id", "ts"]
