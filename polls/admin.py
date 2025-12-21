from django.contrib import admin
from django.http import HttpResponse
import csv

from .models import Poll, Vote

try:
    from core.admin_site import custom_admin_site
except Exception:
    custom_admin_site = None


class VoteInline(admin.TabularInline):
    model = Vote
    extra = 0
    readonly_fields = ("voter_id", "selected_indexes", "selected_names", "ts")


class PollAdmin(admin.ModelAdmin):
    list_display = ("id", "chat_id", "title", "type", "created_at")
    search_fields = ("id", "chat_id", "title")
    inlines = (VoteInline,)
    actions = ("export_votes_csv", "close_polls")

    def export_votes_csv(self, request, queryset):
        # lightweight CSV export of votes for selected polls
        poll = queryset.first()
        if not poll:
            self.message_user(request, "No poll selected")
            return
        votes = Vote.objects.filter(poll__in=queryset)
        resp = HttpResponse(content_type="text/csv")
        resp["Content-Disposition"] = f"attachment; filename=poll_{poll.id}_votes.csv"
        writer = csv.writer(resp)
        writer.writerow(["poll_id", "voter_id", "selected_indexes", "selected_names", "ts"])
        for v in votes:
            writer.writerow([v.poll_id, v.voter_id, v.selected_indexes, v.selected_names, v.ts])
        return resp

    export_votes_csv.short_description = "Export votes (CSV)"

    def close_polls(self, request, queryset):
        # This is a placeholder: set `type` to 'closed' to indicate closed polls
        updated = queryset.update(type="closed")
        self.message_user(request, f"Marked {updated} polls as closed")

    close_polls.short_description = "Close selected polls"


class PollAdminLite(admin.ModelAdmin):
    list_display = ("id", "chat_id", "title", "type", "created_at")
    search_fields = ("id", "chat_id", "title")


class VoteAdmin(admin.ModelAdmin):
    list_display = ("id", "poll", "voter_id", "ts")
    search_fields = ("voter_id",)


if custom_admin_site:
    custom_admin_site.register(Poll, PollAdminLite)
    custom_admin_site.register(Vote, VoteAdmin)
else:
    admin.site.register(Poll, PollAdminLite)
    admin.site.register(Vote, VoteAdmin)
