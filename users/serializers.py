from django.apps import apps
from rest_framework import serializers


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = None
        fields = [
            "id",
            "wa_id",
            "phone",
            "name",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        if self.Meta.model is None:
            self.Meta.model = apps.get_model("users", "UserProfile")
        super().__init__(*args, **kwargs)
