from django.db import models
import uuid


class Identifier(models.Model):
    IDENTIFIER_TYPES = [
        ("phone", "phone"),
        ("lid", "lid"),
        ("group", "group"),
        ("other", "other"),
    ]
    id = models.BigAutoField(primary_key=True)
    # point to the canonical users.UserProfile model
    user = models.ForeignKey("users.UserProfile", related_name="identifiers", on_delete=models.CASCADE, null=True)
    identifier = models.CharField(max_length=255, db_index=True)
    type = models.CharField(max_length=32, choices=IDENTIFIER_TYPES, default="phone")
    observed_from = models.CharField(max_length=255, blank=True, null=True)
    observed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [models.Index(fields=["identifier"])]

    def __str__(self):
        return f"{self.identifier} ({self.type})"


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message_id = models.CharField(max_length=255, unique=True, db_index=True)
    # point messages to the canonical users.UserProfile
    user = models.ForeignKey("users.UserProfile", related_name="messages", on_delete=models.SET_NULL, null=True)
    chat_id = models.CharField(max_length=255, db_index=True)
    from_id = models.CharField(max_length=255, blank=True, null=True)
    display_name = models.CharField(max_length=255, blank=True, null=True)
    is_group = models.BooleanField(default=False)
    body = models.TextField(blank=True, null=True)
    snippet = models.TextField(blank=True, null=True)
    has_media = models.BooleanField(default=False)
    media_meta = models.JSONField(default=dict, blank=True)
    quoted_message_id = models.CharField(max_length=255, blank=True, null=True)
    msg_type = models.CharField(max_length=64, blank=True, null=True)
    received_at = models.DateTimeField()
    processed = models.BooleanField(default=False)
    origin = models.CharField(max_length=128, blank=True, null=True)
    meta = models.JSONField(default=dict, blank=True)
    raw = models.JSONField(blank=True, null=True)
    retention_expires_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [models.Index(fields=["chat_id"]), models.Index(fields=["received_at"])]

    def __str__(self):
        return f"Message {self.message_id} in {self.chat_id}"


class MessageEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    message = models.ForeignKey(Message, related_name="events", on_delete=models.CASCADE)
    event_type = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Event {self.event_type} for {self.message_id}"
