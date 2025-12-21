from django.urls import include, path
from rest_framework import routers

from .api_views import TrainingHistoryViewSet

router = routers.DefaultRouter()
router.register(r"trainings", TrainingHistoryViewSet, basename="training")

urlpatterns = [
    path("", include(router.urls)),
]
