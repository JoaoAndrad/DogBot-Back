from django.contrib import admin

from .models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("wa_id", "phone", "name", "created_at")
    search_fields = ("wa_id", "phone", "name")
