from django.db import models


class UserProfile(models.Model):
    wa_id = models.CharField(
        max_length=64, unique=True, help_text="WhatsApp id, e.g. 5511999999999@c.us"
    )
    phone = models.CharField(max_length=32, blank=True, null=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    metadata = models.JSONField(blank=True, null=True)
    # Fields added to consolidate with bot_messages.UserProfile
    last_push_name = models.CharField(max_length=255, blank=True, null=True)
    push_name_history = models.JSONField(default=list, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    last_seen = models.DateTimeField(blank=True, null=True)
    last_group_activity = models.DateTimeField(blank=True, null=True)
    last_known_lid = models.CharField(max_length=64, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name or self.phone or self.wa_id}"
