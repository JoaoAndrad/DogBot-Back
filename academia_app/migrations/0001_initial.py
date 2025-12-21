import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TrainingHistory",
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
                ("training_date", models.DateTimeField(blank=True, null=True)),
                ("data", models.JSONField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="training_history",
                        to="users.userprofile",
                    ),
                ),
            ],
            options={"ordering": ["-training_date"]},
        ),
    ]
