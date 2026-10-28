"""Acceptance against an explicitly selected disposable Docker stack."""

import io
import os
import secrets
import subprocess
import time
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

import httpx2
import pytest
from PIL import Image

from .test_packs import image_bytes

pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[3]


def test_live_accounts_workers_collaboration_and_exports():
    base = os.getenv("LIVE_QA_API")
    if not base:
        pytest.skip("Set LIVE_QA_API to a disposable local API")
    assert urlsplit(base).hostname in {"localhost", "127.0.0.1", "backend"}, (
        "Acceptance creates fixtures; use isolated local test storage"
    )
    prefix, password = f"acceptance-{secrets.token_hex(6)}", secrets.token_urlsafe(24)
    created = []
    with httpx2.Client(base_url=base, timeout=90) as client:

        def api(session, path, method="GET", payload=None, expected=200, files=None, fields=None):
            headers = {"Authorization": "Bearer " + session["accessToken"]} if session else {}
            response = client.request(method, path, headers=headers, json=payload, files=files, data=fields)
            assert response.status_code == expected, f"{method} {path}: {response.text[:300]}"
            return response.json() if "json" in response.headers.get("content-type", "") else response.content

        def account(kind):
            return api(
                None,
                "auth/register",
                "POST",
                {"email": f"{prefix}-{kind}@example.test", "password": password, "displayName": kind},
                201,
            )

        def pack(session, name, **options):
            value = api(
                session,
                "packs",
                "POST",
                {"name": f"{prefix} {name}", "publisher": "Acceptance", **options},
                201,
            )
            created.append((session, value["id"]))
            return value

        def upload(session, pack_id, index=0, **options):
            return api(
                session,
                f"packs/{pack_id}/stickers/jobs",
                "POST",
                expected=202,
                files={"file": ("fixture.png", image_bytes(index), "image/png")},
                fields={"backgroundRemovalMode": "none", **options},
            )

        def completed(session, job, expected="COMPLETED"):
            deadline = time.monotonic() + 90
            while job["status"] in {"QUEUED", "PROCESSING"} and time.monotonic() < deadline:
                time.sleep(1)
                job = api(session, f"jobs/{job['id']}")
            assert job["status"] == expected, job
            return job

        owner, editor, viewer = account("owner"), account("editor"), account("viewer")
        try:
            team = api(owner, "teams", "POST", {"name": prefix}, 201)
            member = api(
                owner,
                f"teams/{team['id']}/members",
                "POST",
                {"email": editor["user"]["email"], "role": "EDITOR"},
                201,
            )
            shared = pack(owner, "shared", teamId=team["id"])
            assert api(editor, f"packs/{shared['id']}")["canEdit"]
            api(owner, f"teams/{team['id']}/members/{member['id']}", "PATCH", {"role": "VIEWER"})
            assert not api(editor, f"packs/{shared['id']}")["canEdit"]
            api(owner, f"teams/{team['id']}/members/{member['id']}", "DELETE")
            api(editor, f"packs/{shared['id']}", expected=403)
            source, target = (
                pack(owner, "source", isPublic=True, requiresApproval=True),
                pack(owner, "target"),
            )
            for session, role in [(editor, "EDITOR"), (viewer, "VIEWER")]:
                invite = api(
                    owner,
                    f"packs/{source['id']}/invites",
                    "POST",
                    {"email": session["user"]["email"], "role": role},
                    201,
                )
                api(session, f"packs/invites/{invite['code']}/accept", "POST", expected=201)
            api(editor, f"packs/{source['id']}", "PATCH", {"name": "forbidden"}, 403)
            for index in range(3):
                completed(owner, upload(owner, source["id"], index, staticQuality="65"))
            detail = api(owner, f"packs/{source['id']}")
            assert not detail["canExport"]
            ids = [row["id"] for row in detail["stickers"]][::-1]
            api(editor, f"packs/{source['id']}/stickers", "PATCH", {"stickerIds": ids})
            for sticker_id in ids:
                api(
                    editor,
                    f"packs/{source['id']}/stickers/{sticker_id}",
                    "PATCH",
                    {"reviewStatus": "APPROVED"},
                )
            assert api(owner, f"packs/{source['id']}")["canExport"]
            comment = api(
                viewer,
                f"packs/{source['id']}/stickers/{ids[0]}/comments",
                "POST",
                {"body": "Check this"},
                201,
            )
            api(
                editor,
                f"packs/{source['id']}/stickers/{ids[0]}/comments/{comment['id']}",
                "DELETE",
                expected=403,
            )
            api(owner, f"packs/{source['id']}/stickers/{ids[0]}/comments/{comment['id']}", "DELETE")
            document = api(owner, f"packs/{source['id']}/contents")
            assert len(document["sticker_packs"][0]["stickers"]) == 3
            archive = api(None, f"public/packs/{source['id']}/export")
            with zipfile.ZipFile(io.BytesIO(archive)) as contents:
                assert Image.open(io.BytesIO(contents.read("tray_icon.webp"))).size == (96, 96)
            completed(owner, api(owner, f"packs/{source['id']}/export/jobs", "POST", {}, 202))
            clone = api(viewer, f"packs/{source['id']}/clone", "POST", {}, 201)
            created.append((viewer, clone["id"]))
            for method, sticker in [("copy", ids[0]), ("move", ids[1])]:
                api(
                    owner,
                    f"packs/{source['id']}/stickers/{method}",
                    "POST",
                    {"targetPackId": target["id"], "stickerIds": [sticker]},
                    201,
                )
            assert api(owner, f"packs/{target['id']}")["stickerCount"] == 2
            assert any(
                row["id"] == source["id"] and not row["canExport"]
                for row in api(owner, "sync/packs")["packs"]
            )
            animated = pack(owner, "animated", isAnimated=True)
            job = api(
                owner,
                f"packs/{animated['id']}/stickers/jobs",
                "POST",
                expected=202,
                files={"file": ("animated.webp", image_bytes(animated=True), "image/webp")},
                fields={
                    "animatedTrimStart": ".1",
                    "animatedTrimEnd": ".6",
                    "animatedFrameRate": "20",
                    "backgroundRemovalMode": "none",
                },
            )
            completed(owner, job)
            animated_row = api(owner, f"packs/{animated['id']}")["stickers"][0]
            output = api(owner, f"packs/{animated['id']}/stickers/{animated_row['id']}/file")
            assert Image.open(io.BytesIO(output)).n_frames >= 2
            failed = api(
                owner,
                f"packs/{target['id']}/stickers/jobs",
                "POST",
                expected=202,
                files={"file": ("bad.png", b"invalid", "image/png")},
                fields={"backgroundRemovalMode": "none"},
            )
            completed(owner, failed, "FAILED")
            completed(owner, api(owner, f"jobs/{failed['id']}/retry", "POST", expected=201), "FAILED")
            project = os.getenv("LIVE_QA_PROJECT")
            if project:
                assert project.startswith(("sticker-foundry-check-", "sticker-foundry-ci-"))
                subprocess.run(
                    ["docker", "compose", "-p", project, "stop", "worker"],
                    cwd=ROOT,
                    check=True,
                    capture_output=True,
                )
                try:
                    pending = upload(owner, target["id"], 3)
                    assert pending["status"] == "QUEUED"
                    api(owner, f"jobs/{pending['id']}/cancel", "POST", expected=201)
                    pending = api(owner, f"jobs/{pending['id']}/retry", "POST", expected=201)
                finally:
                    subprocess.run(
                        ["docker", "compose", "-p", project, "start", "worker"],
                        cwd=ROOT,
                        check=True,
                        capture_output=True,
                    )
                completed(owner, pending)
            sessions = api(viewer, "auth/sessions")
            api(viewer, f"auth/sessions/{sessions[0]['id']}", "DELETE")
            api(None, "auth/refresh", "POST", {"refreshToken": viewer["refreshToken"]}, 401)
            api(viewer, "auth/me", expected=401)
            viewer.update(
                api(None, "auth/login", "POST", {"email": viewer["user"]["email"], "password": password}, 201)
            )
            api(
                editor,
                "auth/password",
                "PATCH",
                {"currentPassword": password, "newPassword": password + "-new"},
            )
            api(editor, "auth/me", expected=401)
            editor.update(
                api(
                    None,
                    "auth/login",
                    "POST",
                    {"email": editor["user"]["email"], "password": password + "-new"},
                    201,
                )
            )
        finally:
            for session, pack_id in reversed(created):
                api(session, f"packs/{pack_id}", "DELETE")
