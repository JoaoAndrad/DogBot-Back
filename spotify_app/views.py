import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta

import requests
from django.conf import settings
from django.shortcuts import redirect
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from .models import PendingAuth, SpotifyAppToken, SpotifyUserToken


def generate_code_verifier(length: int = 86) -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(length)).rstrip(b"=").decode("ascii")


def code_challenge_from_verifier(verifier: str) -> str:
    m = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(m).rstrip(b"=").decode("ascii")


class SpotifyAuthStartView(APIView):
    """Inicia fluxo OAuth PKCE e cria PendingAuth."""
    permission_classes = [AllowAny]

    def post(self, request):
        # accept wa_id and wa_name from frontend so we can link PendingAuth to UserProfile
        wa_id = request.data.get("wa_id")
        wa_name = request.data.get("wa_name")

        verifier = generate_code_verifier()
        challenge = code_challenge_from_verifier(verifier)
        state = secrets.token_urlsafe(16)

        expires_at = datetime.utcnow() + timedelta(minutes=15)

        pa = PendingAuth.objects.create(
            state=state,
            code_verifier=verifier,
            expires_at=expires_at,
        )

        # Link to UserProfile if wa_id provided (create if necessary)
        if wa_id:
            from users.models import UserProfile

            user, created = UserProfile.objects.get_or_create(wa_id=wa_id, defaults={
                'name': wa_name or None,
            })
            pa.user = user
            pa.save()

        # Fetch app credentials
        app_token = SpotifyAppToken.objects.first()
        client_id = getattr(settings, "SPOTIFY_CLIENT_ID", None)
        redirect_uri = getattr(settings, "SPOTIFY_REDIRECT_URI", None)
        scope = getattr(settings, "SPOTIFY_SCOPES", "user-read-playback-state user-read-currently-playing")

        if app_token:
            client_id = client_id or app_token.client_id
            redirect_uri = redirect_uri or app_token.redirect_uri

        if not client_id or not redirect_uri:
            return Response({"error": "Spotify client_id or redirect_uri not configured"}, status=500)

        params = {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
            "code_challenge_method": "S256",
            "code_challenge": challenge,
        }

        auth_url = "https://accounts.spotify.com/authorize"

        # build url
        from urllib.parse import urlencode

        url = f"{auth_url}?{urlencode(params)}"

        # return pending auth id so frontend can correlate
        return Response({"auth_url": url, "state": state, "pending_auth_id": pa.id})


class SpotifyAuthCallbackView(APIView):
    """Callback que troca code por tokens e registra SpotifyUserToken."""
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.GET.get("code")
        state = request.GET.get("state")

        if not state or not code:
            return Response({"error": "missing code or state"}, status=400)

        try:
            pa = PendingAuth.objects.get(state=state)
        except PendingAuth.DoesNotExist:
            return Response({"error": "invalid state"}, status=400)

        # get client creds
        app_token = SpotifyAppToken.objects.first()
        client_id = getattr(settings, "SPOTIFY_CLIENT_ID", None)
        client_secret = getattr(settings, "SPOTIFY_CLIENT_SECRET", None)
        redirect_uri = getattr(settings, "SPOTIFY_REDIRECT_URI", None)

        if app_token:
            client_id = client_id or app_token.client_id
            client_secret = client_secret or app_token.client_secret
            redirect_uri = redirect_uri or app_token.redirect_uri

        if not client_id or not redirect_uri:
            return Response({"error": "Spotify client_id or redirect_uri not configured"}, status=500)

        token_url = "https://accounts.spotify.com/api/token"
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "code_verifier": pa.code_verifier,
        }

        auth = None
        if client_secret:
            auth = (client_id, client_secret)

        r = requests.post(token_url, data=data, auth=auth)
        if r.status_code != 200:
            pa.expires_at = datetime.utcnow()
            pa.save()
            return Response({"error": "token exchange failed", "detail": r.text}, status=500)

        token_data = r.json()

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")
        scope = token_data.get("scope")

        # try to get spotify user id
        spotify_user_id = None
        if access_token:
            me = requests.get("https://api.spotify.com/v1/me", headers={"Authorization": f"Bearer {access_token}"})
            if me.status_code == 200:
                spotify_user_id = me.json().get("id")

        # create or update SpotifyUserToken
        sut = None
        if pa.user:
            sut, _ = SpotifyUserToken.objects.update_or_create(
                user=pa.user,
                defaults={
                    "spotify_user_id": spotify_user_id,
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "expires_at": datetime.utcnow() + timedelta(seconds=expires_in) if expires_in else None,
                    "scope": scope,
                    "connected_at": datetime.utcnow(),
                },
            )
        else:
            sut = SpotifyUserToken.objects.create(
                spotify_user_id=spotify_user_id,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=datetime.utcnow() + timedelta(seconds=expires_in) if expires_in else None,
                scope=scope,
                connected_at=datetime.utcnow(),
            )

        # mark pending auth expired/used
        pa.expires_at = datetime.utcnow()
        pa.save()

        frontend_redirect = getattr(settings, "SPOTIFY_FRONTEND_REDIRECT", None) or "/"

        # redirect to frontend with success
        # include spotify_user_id and local token id
        from urllib.parse import urlencode

        params = {"spotify_user_id": spotify_user_id, "spotify_token_id": sut.id}
        return redirect(f"{frontend_redirect}?{urlencode(params)}")
