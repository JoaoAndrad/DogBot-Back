r"""
Django management command for running Spotify background jobs.

Usage:
    python manage.py spotify_jobs refresh_tokens
    python manage.py spotify_jobs expire_polls
    python manage.py spotify_jobs poll_tracks
    python manage.py spotify_jobs all

Cron scheduling examples:

    # Refresh tokens every 10 minutes
    */10 * * * * cd /path/to/backend && python manage.py spotify_jobs refresh_tokens >> /var/log/spotify_jobs.log 2>&1

    # Check expired polls every 5 minutes
    */5 * * * * cd /path/to/backend && python manage.py spotify_jobs expire_polls >> /var/log/spotify_jobs.log 2>&1

    # Poll current tracks every 2 minutes
    */2 * * * * cd /path/to/backend && python manage.py spotify_jobs poll_tracks >> /var/log/spotify_jobs.log 2>&1

    # Or run all jobs together every 5 minutes (simpler but less granular)
    */5 * * * * cd /path/to/backend && python manage.py spotify_jobs all >> /var/log/spotify_jobs.log 2>&1

Windows Task Scheduler (PowerShell):
    # Create a scheduled task that runs every 5 minutes
    $action = New-ScheduledTaskAction -Execute "python" -Argument "manage.py spotify_jobs all" -WorkingDirectory "S:\DogBotReborn\backend"
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName "SpotifyBackgroundJobs" -Action $action -Trigger $trigger

Docker container execution:
    # Add to docker-compose.yml as a service with restart policy
    spotify-worker:
      build: .
      command: sh -c "while true; do python manage.py spotify_jobs all && sleep 300; done"
      depends_on:
        - db
      environment:
        - DJANGO_SETTINGS_MODULE=core.settings
"""

import logging
import sys
from django.core.management.base import BaseCommand, CommandError
from spotify_app.tasks import (
    refresh_spotify_tokens,
    check_expired_polls,
    poll_current_tracks,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run Spotify background jobs (token refresh, poll expiry, current track polling)"

    def add_arguments(self, parser):
        parser.add_argument(
            "job",
            type=str,
            choices=["refresh_tokens", "expire_polls", "poll_tracks", "all"],
            help="Which job to run: refresh_tokens, expire_polls, poll_tracks, or all",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Enable verbose logging output",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run in dry-run mode (log actions without persisting changes)",
        )

    def handle(self, *args, **options):
        job = options["job"]
        verbose = options.get("verbose", False)
        dry_run = options.get("dry_run", False)

        if verbose:
            logging.basicConfig(
                level=logging.DEBUG,
                format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            )
        else:
            logging.basicConfig(
                level=logging.INFO,
                format="%(asctime)s [%(levelname)s] %(message)s",
            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING("Running in DRY-RUN mode - no changes will be saved")
            )
            logger.warning("DRY-RUN mode enabled")

        try:
            if job == "refresh_tokens" or job == "all":
                self.stdout.write("Starting token refresh job...")
                result = refresh_spotify_tokens(dry_run=dry_run)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ Token refresh completed: {result.get('refreshed', 0)} tokens refreshed"
                    )
                )
                if result.get("errors"):
                    self.stdout.write(
                        self.style.WARNING(
                            f"  Errors: {len(result['errors'])} token(s) failed"
                        )
                    )

            if job == "expire_polls" or job == "all":
                self.stdout.write("Starting poll expiry job...")
                result = check_expired_polls(dry_run=dry_run)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ Poll expiry completed: {result.get('expired', 0)} polls processed"
                    )
                )

            if job == "poll_tracks" or job == "all":
                self.stdout.write("Starting current track polling job...")
                result = poll_current_tracks(dry_run=dry_run)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ Track polling completed: {result.get('updated', 0)} tracks updated"
                    )
                )
                if result.get("errors"):
                    self.stdout.write(
                        self.style.WARNING(
                            f"  Errors: {len(result['errors'])} user(s) failed"
                        )
                    )

            self.stdout.write(
                self.style.SUCCESS(f"\n✓ Job '{job}' completed successfully")
            )

        except Exception as e:
            logger.exception(f"Critical error running job '{job}'")
            raise CommandError(f"Job '{job}' failed: {str(e)}")
