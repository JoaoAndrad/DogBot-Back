from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("spotify_app", "0001_initial"),
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="SpotifyUserToken",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("spotify_user_id", models.CharField(max_length=255, blank=True, null=True)),
                ("access_token", models.TextField(blank=True, null=True)),
                ("refresh_token", models.TextField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("scope", models.TextField(blank=True, null=True)),
                ("connected_at", models.DateTimeField(blank=True, null=True)),
                ("last_refreshed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="spotify_token", to="users.userprofile"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="SpotifyAppToken",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("client_id", models.CharField(max_length=255)),
                ("client_secret", models.TextField(blank=True, null=True)),
                ("redirect_uri", models.CharField(max_length=1024, blank=True, null=True)),
                ("access_token", models.TextField(blank=True, null=True)),
                ("refresh_token", models.TextField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="Track",
            fields=[
                ("id", models.CharField(max_length=128, primary_key=True, serialize=False)),
                ("url", models.CharField(max_length=1024, blank=True, null=True)),
                ("name", models.CharField(max_length=1024, blank=True, null=True)),
                ("artists", models.CharField(max_length=1024, blank=True, null=True)),
                ("album", models.CharField(max_length=1024, blank=True, null=True)),
                ("image_url", models.CharField(max_length=1024, blank=True, null=True)),
                ("duration_ms", models.IntegerField(blank=True, null=True)),
            ],
        ),
        migrations.CreateModel(
            name="PlaylistEntry",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("playlist_id", models.CharField(max_length=255, default="default")),
                ("track_url", models.CharField(max_length=1024, blank=True, null=True)),
                ("status", models.CharField(max_length=32, default="pending")),
                ("added_at", models.DateTimeField(auto_now_add=True)),
                ("attempts", models.IntegerField(default=0)),
                (
                    "track",
                    models.ForeignKey(on_delete=django.db.models.deletion.SET_NULL, blank=True, null=True, to="spotify_app.track"),
                ),
                (
                    "added_by",
                    models.ForeignKey(on_delete=django.db.models.deletion.SET_NULL, blank=True, null=True, to="users.userprofile"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="Vote",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("vote_type", models.CharField(max_length=32)),
                ("value", models.FloatField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "track",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, blank=True, null=True, to="spotify_app.track"),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="users.userprofile"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="Rating",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("rating", models.DecimalField(max_digits=3, decimal_places=1)),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("is_latest", models.BooleanField(default=True)),
                (
                    "track",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="spotify_app.track"),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="users.userprofile"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="PendingAuth",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("state", models.CharField(max_length=255)),
                ("code_verifier", models.CharField(max_length=1024, blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.SET_NULL, blank=True, null=True, to="users.userprofile"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="EphemeralSession",
            fields=[
                ("session_id", models.UUIDField(primary_key=True, default=uuid.uuid4, serialize=False, editable=False)),
                ("payload", models.JSONField(blank=True, null=True)),
                ("type", models.CharField(max_length=64, blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.SET_NULL, blank=True, null=True, to="users.userprofile"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="CurrentTrack",
            fields=[
                (
                    "user",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, serialize=False, to="users.userprofile"),
                ),
                ("start_time", models.DateTimeField(blank=True, null=True)),
                ("total_ms", models.BigIntegerField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "track",
                    models.ForeignKey(on_delete=django.db.models.deletion.SET_NULL, blank=True, null=True, to="spotify_app.track"),
                ),
            ],
        ),
    ]
