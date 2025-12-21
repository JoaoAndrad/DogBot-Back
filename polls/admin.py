from django.contrib import admin

from .models import Poll, Vote


@admin.register(Poll)
class PollAdmin(admin.ModelAdmin):
    list_display = ("id", "chat_id", "title", "type", "created_at")
    search_fields = ("id", "chat_id", "title")


@admin.register(Vote)
class VoteAdmin(admin.ModelAdmin):
    list_display = ("id", "poll", "voter_id", "ts")
    search_fields = ("voter_id",)
