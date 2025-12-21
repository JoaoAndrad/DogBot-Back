from django.urls import include, path
from rest_framework import routers

from .api_views import SpotifyHistoryViewSet

router = routers.DefaultRouter()
router.register(r"spotify", SpotifyHistoryViewSet, basename="spotify")

urlpatterns = [
    path("", include(router.urls)),
]
