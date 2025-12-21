import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="SpotifyHistory",
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
                ("track_id", models.CharField(max_length=255, blank=True, null=True)),
                (
                    "track_name",
                    models.CharField(max_length=1024, blank=True, null=True),
                ),
                ("artists", models.CharField(max_length=1024, blank=True, null=True)),
                ("played_at", models.DateTimeField(blank=True, null=True)),
                ("raw", models.JSONField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="spotify_history",
                        to="users.userprofile",
                    ),
                ),
            ],
            options={"ordering": ["-played_at"]},
        ),
    ]
