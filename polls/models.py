from django.db import models


class Poll(models.Model):
    # use message id from WhatsApp as primary key when provided
    id = models.CharField(max_length=255, primary_key=True)
    chat_id = models.CharField(max_length=128, db_index=True)
    title = models.TextField()
    options = models.JSONField(default=list)
    poll_options = models.JSONField(default=list)
    options_obj = models.JSONField(default=dict, blank=True)
    type = models.CharField(max_length=32, default="native")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Poll {self.id} ({self.chat_id})"


class Vote(models.Model):
    poll = models.ForeignKey(Poll, related_name="votes", on_delete=models.CASCADE)
    voter_id = models.CharField(max_length=255)
    selected_options = models.JSONField(default=list)
    selected_indexes = models.JSONField(default=list)
    selected_names = models.JSONField(default=list)
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["voter_id"])]

    def __str__(self):
        return f"Vote {self.id} for Poll {self.poll_id} by {self.voter_id}"
