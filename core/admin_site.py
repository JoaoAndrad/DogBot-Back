from django.contrib.admin import AdminSite


class CustomAdminSite(AdminSite):
    site_header = "DogBot Control"
    site_title = "DogBot Admin"
    index_title = "Administration"

    # order apps by a preferred list, fallback to default ordering
    preferred_order = ["users", "bot_messages", "polls", "spotify_app", "academia_app"]

    def get_app_list(self, request):
        app_list = super().get_app_list(request)

        def app_key(app):
            try:
                idx = self.preferred_order.index(app["app_label"])
                return (0, idx)
            except ValueError:
                return (1, app["name"].lower())

        app_list.sort(key=app_key)
        return app_list


custom_admin_site = CustomAdminSite(name="custom_admin")


# Register built-in auth models so they appear in the custom admin as well
try:
    from django.contrib.auth.models import User, Group
    from django.contrib.auth.admin import UserAdmin, GroupAdmin

    custom_admin_site.register(User, UserAdmin)
    custom_admin_site.register(Group, GroupAdmin)
except Exception:
    # keep silent if auth admin isn't importable at startup
    pass
