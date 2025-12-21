from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="last_push_name",
            field=models.CharField(max_length=255, null=True, blank=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="push_name_history",
            field=models.JSONField(default=list, blank=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="meta",
            field=models.JSONField(default=dict, blank=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="last_seen",
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="last_group_activity",
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="last_known_lid",
            field=models.CharField(max_length=64, null=True, blank=True),
        ),
    ]
