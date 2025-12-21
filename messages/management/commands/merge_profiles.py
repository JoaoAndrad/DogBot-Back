import json
import uuid
from datetime import datetime

from django.core.management.base import BaseCommand
from django.apps import apps
from django.db import transaction


class Command(BaseCommand):
    help = "Merge bot_messages.UserProfile records into users.UserProfile. Default is dry-run. Use --commit to apply."

    def add_arguments(self, parser):
        parser.add_argument("--commit", action="store_true", help="Apply changes to the database")
        parser.add_argument("--delete-source", action="store_true", help="Delete bot_messages.UserProfile after merge")
        parser.add_argument("--limit", type=int, default=0, help="Limit number of profiles to process (0 = all)")

    def handle(self, *args, **options):
        commit = options.get("commit", False)
        delete_source = options.get("delete_source", False)
        limit = options.get("limit", 0)

        BotUser = apps.get_model("bot_messages", "UserProfile")
        UsersUser = apps.get_model("users", "UserProfile")
        Identifier = apps.get_model("bot_messages", "Identifier")
        Message = apps.get_model("bot_messages", "Message")

        qs = BotUser.objects.all().order_by("created_at")
        if limit > 0:
            qs = qs[:limit]

        report = {"processed": 0, "created": 0, "updated": 0, "identifier_reassigned": 0, "messages_reassigned": 0, "skipped": 0}
        actions = []

        for b in qs:
            report["processed"] += 1

            # find existing UsersUser by last_known_lid (wa_id) or by identifiers
            target = None
            candidates = []
            if getattr(b, "last_known_lid", None):
                candidates.append({"wa_id": b.last_known_lid})

            # identifiers linked to the bot profile
            ids = list(Identifier.objects.filter(user=b).values_list("identifier", "type"))
            for ident, typ in ids:
                if typ == "phone":
                    candidates.append({"phone": ident})
                else:
                    candidates.append({"wa_id": ident})

            for cand in candidates:
                try:
                    target = UsersUser.objects.filter(**cand).first()
                except Exception:
                    target = None
                if target:
                    break

            created = False
            if not target:
                # create a new users.UserProfile with a safe wa_id
                wa_id = getattr(b, "last_known_lid", None)
                if not wa_id and ids:
                    wa_id = ids[0][0]
                if not wa_id:
                    wa_id = f"migrated-{uuid.uuid4().hex}@migrated"

                new_data = {
                    "wa_id": wa_id,
                    "phone": None,
                    "name": getattr(b, "name", None) or None,
                    "metadata": getattr(b, "meta", {}) or {},
                    "last_push_name": getattr(b, "last_push_name", None),
                    "push_name_history": getattr(b, "push_name_history", []) or [],
                    "meta": getattr(b, "meta", {}) or {},
                    "last_seen": getattr(b, "last_seen", None),
                    "last_group_activity": getattr(b, "last_group_activity", None),
                    "last_known_lid": getattr(b, "last_known_lid", None),
                }

                actions.append({"action": "create_user", "data": new_data, "bot_profile_id": str(b.id)})
                if commit:
                    target = UsersUser.objects.create(**new_data)
                    created = True
                    report["created"] += 1

            else:
                # merge non-null fields from bot profile into target
                changed = False
                updates = {}
                for field in [
                    "name",
                    "last_push_name",
                    "push_name_history",
                    "meta",
                    "last_seen",
                    "last_group_activity",
                    "last_known_lid",
                ]:
                    val = getattr(b, field, None)
                    if val and not getattr(target, field, None):
                        updates[field] = val
                        changed = True

                if updates:
                    actions.append({"action": "update_user", "user_id": str(target.pk), "updates": updates, "bot_profile_id": str(b.id)})
                    if commit:
                        for k, v in updates.items():
                            setattr(target, k, v)
                        target.save()
                        report["updated"] += 1

            # reassign identifiers pointing to bot profile to the target
            id_qs = Identifier.objects.filter(user=b)
            id_count = id_qs.count()
            if id_count:
                actions.append({"action": "reassign_identifiers", "count": id_count, "bot_profile_id": str(b.id), "target_id": str(getattr(target, "pk", None))})
                if commit:
                    id_qs.update(user=target)
                    report["identifier_reassigned"] += id_count

            # reassign messages
            msg_qs = Message.objects.filter(user=b)
            msg_count = msg_qs.count()
            if msg_count:
                actions.append({"action": "reassign_messages", "count": msg_count, "bot_profile_id": str(b.id), "target_id": str(getattr(target, "pk", None))})
                if commit:
                    msg_qs.update(user=target)
                    report["messages_reassigned"] += msg_count

            # optionally delete source profile
            if delete_source:
                actions.append({"action": "delete_source", "bot_profile_id": str(b.id)})
                if commit:
                    b.delete()

        # print a summary report
        out = {"summary": report, "actions": actions, "generated_at": datetime.utcnow().isoformat() + "Z"}
        self.stdout.write(json.dumps(out, indent=2, ensure_ascii=False))
        if commit:
            self.stdout.write(self.style.SUCCESS("Merge applied"))
        else:
            self.stdout.write(self.style.WARNING("Dry-run complete. Use --commit to apply changes."))
