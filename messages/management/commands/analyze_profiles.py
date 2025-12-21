import json
from datetime import datetime

from django.core.management.base import BaseCommand
from django.apps import apps
from django.db.models import Count


def sample_queryset(qs, limit=5):
    return [
        {
            k: getattr(obj, k) if hasattr(obj, k) else None
            for k in getattr(obj, "_sample_fields", [])
        }
        for obj in list(qs[:limit])
    ]


class Command(BaseCommand):
    help = "Analyze user/group/message/identifier counts and detect duplicates; writes JSON report to backend/reports/"

    def handle(self, *args, **options):
        report = {"generated_at": datetime.utcnow().isoformat() + "Z", "counts": {}, "examples": {}, "duplicates": {}}

        # Core models
        Group = apps.get_model("auth", "Group")
        User = apps.get_model("auth", "User")

        report["counts"]["auth_groups"] = Group.objects.count()
        report["counts"]["auth_users"] = User.objects.count()

        report["examples"]["groups"] = list(Group.objects.values("id", "name")[:10])
        report["examples"]["users"] = list(User.objects.values("id", "username", "email")[:10])

        # Attempt to load project UserProfile (users app)
        try:
            UsersProfile = apps.get_model("users", "UserProfile")
            report["counts"]["users_userprofile"] = UsersProfile.objects.count()
            # pick a safe set of fields that exist on the model to avoid FieldError
            up_fields = [f.name for f in UsersProfile._meta.get_fields() if hasattr(f, "name")]
            prefer = ["id", "name", "last_push_name", "last_seen", "wa_id", "phone", "email"]
            pick = [f for f in prefer if f in up_fields]
            if not pick:
                # fallback to first 5 concrete field names
                pick = [f.name for f in UsersProfile._meta.fields[:5]]
            report["examples"]["users_userprofile"] = list(UsersProfile.objects.values(*pick)[:10])
        except LookupError:
            report["counts"]["users_userprofile"] = None
            report["examples"]["users_userprofile"] = []

        # Messages app models (label bot_messages)
        try:
            BotUserProfile = apps.get_model("bot_messages", "UserProfile")
            Identifier = apps.get_model("bot_messages", "Identifier")
            Message = apps.get_model("bot_messages", "Message")
            MessageEvent = apps.get_model("bot_messages", "MessageEvent")

            report["counts"]["bot_messages_userprofile"] = BotUserProfile.objects.count()
            report["counts"]["bot_messages_identifier"] = Identifier.objects.count()
            report["counts"]["bot_messages_message"] = Message.objects.count()
            report["counts"]["bot_messages_messageevent"] = MessageEvent.objects.count()

            report["examples"]["bot_messages_userprofile"] = list(
                BotUserProfile.objects.values("id", "name", "last_push_name")[:10]
            )
            report["examples"]["bot_messages_identifier"] = list(
                Identifier.objects.values("id", "identifier", "type", "user")[:10]
            )
            report["examples"]["bot_messages_message"] = list(
                Message.objects.values("id", "message_id", "chat_id", "body")[:10]
            )

            # Duplicate identifiers: identifier + type occurrences > 1
            dup_ids = (
                Identifier.objects.values("identifier", "type")
                .annotate(cnt=Count("id"))
                .filter(cnt__gt=1)
                .order_by("-cnt")
            )
            report["duplicates"]["identifiers"] = list(dup_ids[:50])

        except LookupError:
            report["counts"]["bot_messages_userprofile"] = None
            report["counts"]["bot_messages_identifier"] = None
            report["counts"]["bot_messages_message"] = None
            report["counts"]["bot_messages_messageevent"] = None
            report["examples"]["bot_messages_userprofile"] = []
            report["examples"]["bot_messages_identifier"] = []
            report["examples"]["bot_messages_message"] = []
            report["duplicates"]["identifiers"] = []

        # Duplicate groups by name
        dup_groups = (
            Group.objects.values("name").annotate(cnt=Count("id")).filter(cnt__gt=1).order_by("-cnt")
        )
        report["duplicates"]["groups"] = list(dup_groups[:50])

        # Write report file
        import os

        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        reports_dir = os.path.join(backend_dir, "reports")
        os.makedirs(reports_dir, exist_ok=True)
        filename = os.path.join(reports_dir, f"profile_analysis_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json")
        with open(filename, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)

        self.stdout.write(self.style.SUCCESS(f"Analysis complete — report written to {filename}"))
        # Print short summary
        for k, v in report["counts"].items():
            self.stdout.write(f"{k}: {v}")
