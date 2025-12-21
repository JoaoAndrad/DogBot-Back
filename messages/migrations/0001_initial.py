from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Identifier",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                (
                    "user",
                    models.ForeignKey(
                        to="users.UserProfile",
                        related_name="identifiers",
                        on_delete=models.CASCADE,
                        null=True,
                    ),
                ),
                ("identifier", models.CharField(max_length=255, db_index=True)),
                ("type", models.CharField(max_length=32, default="phone")),
                ("observed_from", models.CharField(max_length=255, null=True, blank=True)),
                ("observed_at", models.DateTimeField(null=True, blank=True)),
            ],
            options={
                "indexes": [models.Index(fields=["identifier"], name="bot_messages_identifier_identifier_idx")],
            },
        ),
        migrations.CreateModel(
            name="Message",
            fields=[
                (
                    "id",
                    models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False),
                ),
                ("message_id", models.CharField(max_length=255, unique=True, db_index=True)),
                (
                    "user",
                    models.ForeignKey(
                        to="users.UserProfile",
                        related_name="messages",
                        on_delete=models.SET_NULL,
                        null=True,
                    ),
                ),
                ("chat_id", models.CharField(max_length=255, db_index=True)),
                ("from_id", models.CharField(max_length=255, null=True, blank=True)),
                ("display_name", models.CharField(max_length=255, null=True, blank=True)),
                ("is_group", models.BooleanField(default=False)),
                ("body", models.TextField(null=True, blank=True)),
                ("snippet", models.TextField(null=True, blank=True)),
                ("has_media", models.BooleanField(default=False)),
                ("media_meta", models.JSONField(default=dict, blank=True)),
                ("quoted_message_id", models.CharField(max_length=255, null=True, blank=True)),
                ("msg_type", models.CharField(max_length=64, null=True, blank=True)),
                ("received_at", models.DateTimeField()),
                ("processed", models.BooleanField(default=False)),
                ("origin", models.CharField(max_length=128, null=True, blank=True)),
                ("meta", models.JSONField(default=dict, blank=True)),
                ("raw", models.JSONField(null=True, blank=True)),
                ("retention_expires_at", models.DateTimeField(null=True, blank=True)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["chat_id"], name="bot_messages_message_chat_id_idx"),
                    models.Index(fields=["received_at"], name="bot_messages_message_received_at_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="MessageEvent",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                (
                    "message",
                    models.ForeignKey(
                        to="bot_messages.Message", related_name="events", on_delete=models.CASCADE
                    ),
                ),
                ("event_type", models.CharField(max_length=64, db_index=True)),
                ("payload", models.JSONField(default=dict, blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
