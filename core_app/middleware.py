import os

from django.http import HttpResponseForbidden


class ServiceAuthMiddleware:
    """Protects bot endpoints using a shared secret header.

    Configure the secret via `BOT_SECRET` env var. The middleware checks
    header `X-Bot-Secret` for requests under `/api/bot/` and returns 403
    when missing or mismatched.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.secret = os.environ.get("BOT_SECRET")

    def __call__(self, request):
        # Only enforce for bot API prefix; adjust if your bot uses a different path
        if request.path.startswith("/api/bot/"):
            header = request.headers.get("X-Bot-Secret") or request.META.get("HTTP_X_BOT_SECRET")
            if not self.secret or header != self.secret:
                return HttpResponseForbidden("Forbidden")
        return self.get_response(request)
