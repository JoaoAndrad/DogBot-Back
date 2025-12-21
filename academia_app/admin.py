from django.contrib import admin

from .models import TrainingHistory


@admin.register(TrainingHistory)
class TrainingHistoryAdmin(admin.ModelAdmin):
    list_display = ("user", "training_date")
    search_fields = ("user__wa_id",)
