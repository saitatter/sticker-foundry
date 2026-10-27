import base64
import copy
import os
import re
import threading
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import Page, Route

from tool.preview_web import create_server

USER = {
    "id": "user",
    "displayName": "Artist",
    "email": "artist@example.test",
    "isAdmin": True,
}
INITIAL = {
    "id": "pack",
    "name": "Little moments",
    "publisher": "Artist",
    "isPublic": True,
    "isAnimated": False,
    "canEdit": True,
    "canManage": True,
    "canExport": True,
    "imageDataVersion": "1",
    "stickerCount": 3,
    "stickers": [
        {
            "id": f"s{i}",
            "fileName": f"s{i}.webp",
            "emojis": ["\U0001f600"],
            "reviewStatus": "PENDING",
            "accessibilityText": f"Sticker {i}",
        }
        for i in range(1, 4)
    ],
}


@pytest.fixture(scope="session")
def base_url():
    if external := os.getenv("WEB_BASE_URL"):
        yield external
        return
    with create_server(0, os.getenv("API_ORIGIN", "http://127.0.0.1:8080")) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}"
        finally:
            server.shutdown()
            thread.join()


@pytest.fixture(autouse=True)
def mock_api(page: Page):
    packs, signed_in = [copy.deepcopy(INITIAL)], False

    def handle(route: Route):
        nonlocal packs, signed_in
        request = route.request
        path, method = urlsplit(request.url).path.removeprefix("/api/"), request.method
        if path.endswith("/file"):
            route.fulfill(
                content_type="image/png",
                body=base64.b64decode(
                    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
                ),
            )
            return
        if method == "GET" and path.endswith("/tray-icon"):
            route.fulfill(status=404, json={"message": "No icon yet"})
            return
        body, status = {}, 200
        if path == "auth/refresh":
            status = 200 if signed_in else 401
            body = {"accessToken": "token", "user": USER} if signed_in else {"message": "Expired"}
        elif path == "instance":
            body = {"instanceName": "Sticker Foundry"}
        elif path == "auth/login":
            signed_in = True
            body = {"accessToken": "token", "refreshToken": "refresh", "user": USER}
        elif path == "auth/me":
            body = USER
        elif path == "admin/settings":
            body = {
                "instanceName": "Sticker Foundry",
                "registrationMode": "open",
                "backgroundRemoval": {"thresholdAvailable": True},
            }
        elif path.endswith("/activity"):
            body = [
                {"id": f"event-{i}", "action": f"Event {i}", "createdAt": "2026-10-26"} for i in range(12)
            ]
        elif re.fullmatch(r"packs/pack/stickers/s\d", path) and method == "PATCH":
            packs[0]["stickers"] = [
                {**s, **request.post_data_json} if path.endswith("/" + s["id"]) else s
                for s in packs[0]["stickers"]
            ]
        elif path == "packs" and method == "POST":
            body = {
                **copy.deepcopy(INITIAL),
                **request.post_data_json,
                "id": "new-pack",
                "stickerCount": 0,
                "canExport": False,
            }
            packs.append(body)
        elif path in {"packs", "public/packs"}:
            body = packs
        elif path in {"teams", "auth/sessions"} or path.endswith(("/members", "/invites")):
            body = []
        elif re.fullmatch(r"packs/[^/]+", path) and method == "PATCH":
            pack_id = path.split("/")[1]
            packs = [{**p, **request.post_data_json} if p["id"] == pack_id else p for p in packs]
            body = next(p for p in packs if p["id"] == pack_id)
        elif path == "packs/new-pack" and method == "DELETE":
            packs = [p for p in packs if p["id"] != "new-pack"]
        elif path == "sync/packs":
            body = {"packs": []}
        elif path.startswith(("packs/", "public/packs/")):
            pack_id = path.split("packs/")[1].split("/")[0]
            body = next((p for p in packs if p["id"] == pack_id), INITIAL)
        route.fulfill(status=status, json=body)

    page.route("**/api/**", handle)
