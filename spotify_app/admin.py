from django.contrib import admin

from .models import SpotifyHistory

try:
    from core.admin_site import custom_admin_site
except Exception:
    custom_admin_site = None


class SpotifyHistoryAdmin(admin.ModelAdmin):
    list_display = ("track_name", "artists", "played_at", "user")
    search_fields = ("track_name", "artists", "user__wa_id")


if custom_admin_site:
    custom_admin_site.register(SpotifyHistory, SpotifyHistoryAdmin)
else:
    admin.site.register(SpotifyHistory, SpotifyHistoryAdmin)
