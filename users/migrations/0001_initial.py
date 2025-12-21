from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="UserProfile",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "wa_id",
                    models.CharField(
                        max_length=64,
                        unique=True,
                        help_text="WhatsApp id, e.g. 5511999999999@c.us",
                    ),
                ),
                ("phone", models.CharField(max_length=32, blank=True, null=True)),
                ("name", models.CharField(max_length=255, blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
