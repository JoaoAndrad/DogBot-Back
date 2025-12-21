from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token

from . import views

app_name = "core_app"

urlpatterns = [
    path("", views.index, name="index"),
    path("health/", views.health, name="health"),
    path("api/users/", include("users.urls")),
    path("api/spotify/", include("spotify_app.urls")),
    path("api/trainings/", include("academia_app.urls")),
    path("api-token-auth/", obtain_auth_token, name="api_token_auth"),
]
