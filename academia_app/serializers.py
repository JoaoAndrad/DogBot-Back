from django.apps import apps
from rest_framework import serializers


class TrainingHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = None
        fields = ["id", "user", "training_date", "data", "notes"]

    def __init__(self, *args, **kwargs):
        if self.Meta.model is None:
            self.Meta.model = apps.get_model("academia_app", "TrainingHistory")
        super().__init__(*args, **kwargs)
