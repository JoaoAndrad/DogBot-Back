from django.contrib import admin
from django.utils.html import format_html

from .models import UserProfile
from messages.models import Identifier
from core.admin_helpers import merge_identifiers_action


try:
    from core.admin_site import custom_admin_site
except Exception:
    custom_admin_site = None


class IdentifierInline(admin.TabularInline):
    model = Identifier
    fields = ("identifier", "type", "observed_at", "observed_from")
    extra = 0
    readonly_fields = ("observed_at",)


class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "wa_id", "phone", "last_seen")
    search_fields = ("name", "wa_id", "phone", "last_push_name")
    list_filter = ("last_seen",)
    inlines = (IdentifierInline,)
    fieldsets = (
        ("Profile", {"fields": ("name", "wa_id", "phone")} ),
        ("Bot", {"fields": ("last_push_name", "push_name_history", "last_known_lid")} ),
        ("Meta", {"fields": ("metadata", "meta")} ),
    )
    readonly_fields = ()


if custom_admin_site:
    custom_admin_site.register(UserProfile, UserProfileAdmin)
else:
    admin.site.register(UserProfile, UserProfileAdmin)
