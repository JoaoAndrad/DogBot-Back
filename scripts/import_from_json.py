import json
import logging
import os
import sys
from pathlib import Path

import django


def setup_django():
    project_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_root))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
    django.setup()


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def import_users(data_path):
    from users.models import UserProfile

    users_file = Path(data_path) / "data" / "pending_users.json"
    if not users_file.exists():
        logging.warning("No users file found at %s", users_file)
        return
    data = load_json(users_file)
    created = 0
    for item in data:
        wa_id = item.get("wa_id") or item.get("id") or item.get("phone")
        if not wa_id:
            continue
        obj, _ = UserProfile.objects.get_or_create(
            wa_id=wa_id,
            defaults={
                "phone": item.get("phone"),
                "name": item.get("name"),
                "metadata": item,
            },
        )
        created += 1
    logging.info("Imported users (approx): %d", created)


def import_spotify_history(data_path):
    from spotify_app.models import SpotifyHistory
    from users.models import UserProfile

    spotify_dir = Path(data_path) / "spotify"
    if not spotify_dir.exists():
        logging.warning("No spotify folder at %s", spotify_dir)
        return
    # This script expects a JSON array file 'history.json' or will scan files
    candidate = spotify_dir / "history.json"
    files = [candidate] if candidate.exists() else list(spotify_dir.glob("*.json"))
    created = 0
    for f in files:
        try:
            arr = load_json(f)
        except Exception:
            continue
        if isinstance(arr, dict):
            # maybe object with items
            arr = arr.get("items") or [arr]
        for it in arr:
            # map minimal fields
            user_wa = it.get("user_wa") or it.get("user")
            if not user_wa:
                continue
            user, _ = UserProfile.objects.get_or_create(wa_id=user_wa)
            SpotifyHistory.objects.create(
                user=user,
                track_id=it.get("track_id") or it.get("id"),
                track_name=it.get("track_name") or it.get("name"),
                artists=(
                    ", ".join(it.get("artists", []))
                    if it.get("artists")
                    else it.get("artist")
                ),
                played_at=it.get("played_at"),
                raw=it,
            )
            created += 1
    logging.info("Imported spotify items: %d", created)


def import_training_history(data_path):
    from academia_app.models import TrainingHistory
    from users.models import UserProfile

    trainings_file = Path(data_path) / "data" / "training_history.json"
    if not trainings_file.exists():
        logging.warning("No training file found at %s", trainings_file)
        return
    arr = load_json(trainings_file)
    created = 0
    for it in arr:
        user_wa = it.get("wa_id") or it.get("user")
        if not user_wa:
            continue
        user, _ = UserProfile.objects.get_or_create(wa_id=user_wa)
        TrainingHistory.objects.create(
            user=user,
            training_date=it.get("training_date"),
            data=it,
            notes=it.get("notes"),
        )
        created += 1
    logging.info("Imported training items: %d", created)


def main():
    if len(sys.argv) < 2:
        logging.error("Usage: import_from_json.py <path-to-dogbot-folder>")
        return
    data_path = sys.argv[1]
    setup_django()
    import_users(data_path)
    import_spotify_history(data_path)
    import_training_history(data_path)


if __name__ == "__main__":
    main()
