from django.contrib import admin

from .models import Identifier, Message, MessageEvent
from core.admin_helpers import merge_identifiers_action

try:
    from core.admin_site import custom_admin_site
except Exception:
    custom_admin_site = None


class MessageEventInline(admin.TabularInline):
    model = MessageEvent
    extra = 0
    readonly_fields = ("created_at",)


class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "message_id", "chat_id", "display_name", "received_at", "processed")
    search_fields = ("message_id", "chat_id", "body")
    list_filter = ("is_group", "processed", "origin")
    inlines = (MessageEventInline,)
    readonly_fields = ("raw", "media_meta")


class IdentifierAdmin(admin.ModelAdmin):
    list_display = ("id", "identifier", "type", "user")
    search_fields = ("identifier",)
    list_filter = ("type",)
    actions = (merge_identifiers_action,)


class MessageEventAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "event_type", "created_at")
    search_fields = ("event_type",)


if custom_admin_site:
    custom_admin_site.register(Message, MessageAdmin)
    custom_admin_site.register(Identifier, IdentifierAdmin)
    custom_admin_site.register(MessageEvent, MessageEventAdmin)
else:
    admin.site.register(Message, MessageAdmin)
    admin.site.register(Identifier, IdentifierAdmin)
    admin.site.register(MessageEvent, MessageEventAdmin)
