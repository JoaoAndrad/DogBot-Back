from django.contrib import admin

from .models import SpotifyHistory


@admin.register(SpotifyHistory)
class SpotifyHistoryAdmin(admin.ModelAdmin):
    list_display = ("track_name", "artists", "played_at", "user")
    search_fields = ("track_name", "artists", "user__wa_id")
