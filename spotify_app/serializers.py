from django.apps import apps
from rest_framework import serializers


class SpotifyHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = None
        fields = ["id", "user", "track_id", "track_name", "artists", "played_at", "raw"]

    def __init__(self, *args, **kwargs):
        if self.Meta.model is None:
            self.Meta.model = apps.get_model("spotify_app", "SpotifyHistory")
        super().__init__(*args, **kwargs)
