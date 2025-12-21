from django.db import models

from users.models import UserProfile


class TrainingHistory(models.Model):
    user = models.ForeignKey(
        UserProfile, on_delete=models.CASCADE, related_name="training_history"
    )
    training_date = models.DateTimeField(blank=True, null=True)
    data = models.JSONField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-training_date"]

    def __str__(self):
        return f"Training {self.user} @ {self.training_date}"
