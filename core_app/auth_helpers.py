"""Helpers for authenticating bot requests per-view.

Provides a simple `bot_required` decorator that checks the `X-Bot-Secret`
header against the `BOT_SECRET` env var (exposed in Django settings).

Usage:
    from core_app.auth_helpers import bot_required

    @bot_required
    def my_view(request):
        ...
"""

from functools import wraps

from django.conf import settings
from django.http import HttpResponseForbidden


def bot_required(view_func):
    """Decorator that returns 403 when `X-Bot-Secret` doesn't match.

    The secret should be configured as environment variable `BOT_SECRET`
    which is available via `settings.BOT_SECRET` (or in `.env`).
    """

    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        secret = getattr(settings, "BOT_SECRET", None)
        header = request.headers.get("X-Bot-Secret") or request.META.get("HTTP_X_BOT_SECRET")
        if not secret or header != secret:
            return HttpResponseForbidden("Forbidden")
        return view_func(request, *args, **kwargs)

    return _wrapped


def verify_bot_request(request):
    """Programmatic check: returns True if request is authenticated, else False."""
    secret = getattr(settings, "BOT_SECRET", None)
    header = request.headers.get("X-Bot-Secret") or request.META.get("HTTP_X_BOT_SECRET")
    return bool(secret and header == secret)
