from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("spotify_app", "0002_add_spotify_models"),
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="GroupPlaylist",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("group_chat_id", models.CharField(max_length=128, unique=True)),
                ("playlist_id", models.CharField(max_length=255)),
                ("playlist_name", models.CharField(max_length=512, blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="PendingVoteSession",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("eligible_voters", models.JSONField(default=list)),
                ("state", models.CharField(max_length=32, default="active")),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("threshold_type", models.CharField(max_length=32, default="fixed")),
                ("threshold_value", models.IntegerField(default=3)),
                (
                    "playlist_entry",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="vote_sessions", to="spotify_app.playlistentry"),
                ),
                (
                    "created_by",
                    models.ForeignKey(on_delete=django.db.models.deletion.SET_NULL, blank=True, null=True, to="users.userprofile"),
                ),
            ],
        ),
    ]
