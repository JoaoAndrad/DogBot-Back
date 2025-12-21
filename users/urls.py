from django.urls import include, path
from rest_framework import routers

from .api_views import UserProfileViewSet

router = routers.DefaultRouter()
router.register(r"users", UserProfileViewSet, basename="user")

urlpatterns = [
    path("", include(router.urls)),
]
