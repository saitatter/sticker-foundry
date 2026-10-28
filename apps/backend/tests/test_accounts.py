from datetime import timedelta

from foundry.auth import digest
from foundry.db import session_factory
from foundry.models import PasswordResetToken, UserSession, now

from .conftest import register


def test_registration_login_rotation_and_cookie_only_session(client):
    result, headers = register(client)
    assert result["user"]["isAdmin"] is True
    assert "passwordHash" not in client.get("/api/auth/me", headers=headers).json()
    second, _ = register(client, "other@example.test", "Other")
    assert second["user"]["isAdmin"] is False
    denied = client.post("/api/auth/login", json={"email": "owner@example.test", "password": "wrong"})
    assert denied.status_code == 401
    refreshed = client.post("/api/auth/refresh", json={"refreshToken": result["refreshToken"]})
    assert refreshed.status_code == 201
    assert refreshed.json()["refreshToken"] != result["refreshToken"]
    assert client.post("/api/auth/refresh", json={"refreshToken": result["refreshToken"]}).status_code == 401
    browser = client.post(
        "/api/auth/login",
        json={"email": "owner@example.test", "password": "password123"},
        headers={"X-Refresh-Cookie": "true"},
    )
    assert browser.status_code == 201
    assert "refreshToken" not in browser.json()
    assert "HttpOnly" in browser.headers["set-cookie"]
    assert client.post("/api/auth/refresh", json={}, headers={"X-Refresh-Cookie": "true"}).status_code == 201


def test_password_change_and_owned_session_revocation(client, owner):
    result, headers = owner
    _, stranger = register(client, "stranger@example.test")
    session = client.get("/api/auth/sessions", headers=headers).json()[0]
    assert client.delete(f"/api/auth/sessions/{session['id']}", headers=stranger).status_code == 404
    assert (
        client.patch(
            "/api/auth/password",
            headers=headers,
            json={"currentPassword": "bad", "newPassword": "updated-pass"},
        ).status_code
        == 401
    )
    assert (
        client.patch(
            "/api/auth/password",
            headers=headers,
            json={"currentPassword": "password123", "newPassword": "updated-pass"},
        ).status_code
        == 200
    )
    assert client.post("/api/auth/refresh", json={"refreshToken": result["refreshToken"]}).status_code == 401
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"email": "owner@example.test", "password": "updated-pass"}
        ).status_code
        == 201
    )


def test_reset_token_is_single_use_and_does_not_require_a_session(client, owner):
    result, headers = owner
    with session_factory()() as db:
        db.add(
            PasswordResetToken(
                user_id=result["user"]["id"],
                token_hash=digest("test-reset-token"),
                expires_at=now() + timedelta(minutes=5),
            )
        )
        db.commit()
    reset = {"token": "test-reset-token", "newPassword": "replacement-pass"}
    assert client.post("/api/auth/password/reset/confirm", json=reset).status_code == 201
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert client.post("/api/auth/password/reset/confirm", json=reset).status_code == 400
    assert (
        client.post(
            "/api/auth/login", json={"email": "owner@example.test", "password": "replacement-pass"}
        ).status_code
        == 201
    )


def test_session_revocation_blocks_access_and_refresh_without_affecting_other_devices(client, owner):
    original, first = owner
    second = client.post(
        "/api/auth/login", json={"email": "owner@example.test", "password": "password123"}
    ).json()
    other = {"Authorization": "Bearer " + second["accessToken"]}
    rows = client.get("/api/auth/sessions", headers=first).json()
    assert sum(row["isCurrent"] for row in rows) == 1
    current = next(row for row in rows if row["isCurrent"])
    assert client.delete(f"/api/auth/sessions/{current['id']}", headers=other).status_code == 200
    assert client.get("/api/auth/me", headers=first).status_code == 401
    assert (
        client.post("/api/auth/refresh", json={"refreshToken": original["refreshToken"]}).status_code == 401
    )
    assert client.get("/api/auth/me", headers=other).status_code == 200
    remaining = client.get("/api/auth/sessions", headers=other).json()
    assert len(remaining) == 1 and remaining[0]["isCurrent"]
    assert client.delete("/api/auth/sessions", headers=other).status_code == 200
    assert client.get("/api/auth/me", headers=other).status_code == 401
    assert client.post("/api/auth/refresh", json={"refreshToken": second["refreshToken"]}).status_code == 401


def test_expired_session_blocks_an_unexpired_access_token(client, owner):
    _, headers = owner
    row = client.get("/api/auth/sessions", headers=headers).json()[0]
    with session_factory()() as db:
        db.get(UserSession, row["id"]).expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_instance_policy_and_admin_permissions(client, owner):
    _, headers = owner
    _, viewer = register(client, "viewer@example.test")
    assert client.get("/api/admin/settings", headers=viewer).status_code == 403
    saved = client.patch(
        "/api/admin/settings",
        headers=headers,
        json={
            "instanceName": "Team stickers",
            "registrationMode": "invite-only",
            "registrationInviteCode": "correct-code",
        },
    )
    assert saved.status_code == 200, saved.text
    assert client.get("/api/instance").json()["instanceName"] == "Team stickers"
    payload = {"email": "invited@example.test", "displayName": "Invited", "password": "password123"}
    assert client.post("/api/auth/register", json=payload).status_code == 403
    assert (
        client.post("/api/auth/register", json={**payload, "inviteCode": "correct-code"}).status_code == 201
    )


def test_validation_does_not_echo_secrets(client):
    response = client.post(
        "/api/auth/register", json={"email": "bad", "displayName": "A", "password": "SECRET"}
    )
    assert response.status_code == 400
    assert "SECRET" not in response.text
    assert response.headers["x-request-id"]
