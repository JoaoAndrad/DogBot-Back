from django.contrib import admin

from .models import TrainingHistory

try:
    from core.admin_site import custom_admin_site
except Exception:
    custom_admin_site = None


class TrainingHistoryAdmin(admin.ModelAdmin):
    list_display = ("user", "training_date")
    search_fields = ("user__wa_id",)


if custom_admin_site:
    custom_admin_site.register(TrainingHistory, TrainingHistoryAdmin)
else:
    admin.site.register(TrainingHistory, TrainingHistoryAdmin)
