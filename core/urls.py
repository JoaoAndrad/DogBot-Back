from django.urls import include, path
from .admin_site import custom_admin_site

urlpatterns = [
    path("admin/", custom_admin_site.urls),
    path("api/messages/", include("messages.urls")),
    path("", include("core_app.urls")),
]
