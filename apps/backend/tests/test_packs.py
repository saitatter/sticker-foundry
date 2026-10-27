import io
import json
import zipfile

from PIL import Image, ImageDraw

from .conftest import register


def image_bytes(index=0, *, animated=False):
    frames = []
    for i in range(3 if animated else 1):
        image = Image.new("RGBA", (64, 48), (255, 255, 255, 255))
        draw = ImageDraw.Draw(image)
        draw.rectangle(
            (6 + index, 8 + i * 3, 30 + index, 32 + i * 3), fill=(40 + index * 50, 80 + i * 50, 160, 255)
        )
        frames.append(image)
    output = io.BytesIO()
    frames[0].save(
        output,
        format="WEBP" if animated else "PNG",
        save_all=animated,
        append_images=frames[1:],
        duration=[100, 300, 200] if animated else 100,
        loop=0,
    )
    return output.getvalue()


def make_pack(client, headers, name="Pack", **options):
    response = client.post("/api/packs", headers=headers, json={"name": name, "publisher": "QA", **options})
    assert response.status_code == 201, response.text
    return response.json()


def upload(client, headers, pack_id, index=0, *, queued=False, **options):
    response = client.post(
        f"/api/packs/{pack_id}/stickers" + ("/jobs" if queued else ""),
        headers=headers,
        files={"file": ("fixture.png", image_bytes(index), "image/png")},
        data={"backgroundRemovalMode": "none", **options},
    )
    assert response.status_code == (202 if queued else 201), response.text
    return response.json()


def test_pack_upload_review_export_and_versions(client, owner):
    _, headers = owner
    pack = make_pack(client, headers, isPublic=True, requiresApproval=True)
    rows = [upload(client, headers, pack["id"], i) for i in range(3)]
    detail = client.get(f"/api/packs/{pack['id']}", headers=headers).json()
    assert detail["stickerCount"] == 3 and detail["canExport"] is False
    assert client.get(f"/api/public/packs/{pack['id']}/stickers/{rows[0]['id']}/file").status_code == 404
    for row in rows:
        response = client.patch(
            f"/api/packs/{pack['id']}/stickers/{row['id']}",
            headers=headers,
            json={"reviewStatus": "APPROVED"},
        )
        assert response.status_code == 200, response.text
    response = client.get(f"/api/packs/{pack['id']}/manifest", headers=headers)
    assert response.status_code == 200, response.text
    assert (
        client.get(
            f"/api/packs/{pack['id']}/manifest",
            headers={**headers, "If-None-Match": response.headers["etag"]},
        ).status_code
        == 304
    )
    exported = client.get(f"/api/public/packs/{pack['id']}/export")
    assert exported.status_code == 200, exported.text[:100]
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        document = json.loads(archive.read("contents.json"))
        assert len(document["sticker_packs"][0]["stickers"]) == 3
        assert Image.open(io.BytesIO(archive.read("tray_icon.webp"))).size == (96, 96)
        for row in document["sticker_packs"][0]["stickers"]:
            assert Image.open(io.BytesIO(archive.read(row["image_file"]))).size == (512, 512)
    conflict = client.post(
        f"/api/packs/{pack['id']}/tray-icon",
        headers={**headers, "If-Match": "0"},
        files={"file": ("tray.png", image_bytes(), "image/png")},
    )
    assert conflict.status_code == 409
    assert client.get("/api/sync/packs", headers=headers).json()["packs"][0]["canExport"] is True


def test_roles_invites_comments_copy_move_and_activity(client, owner):
    _, headers = owner
    _, editor = register(client, "editor@example.test")
    _, viewer = register(client, "viewer@example.test")
    source, target = make_pack(client, headers), make_pack(client, headers, "Target")
    for email, role, session in [
        ("editor@example.test", "EDITOR", editor),
        ("viewer@example.test", "VIEWER", viewer),
    ]:
        invite = client.post(
            f"/api/packs/{source['id']}/invites", headers=headers, json={"email": email, "role": role}
        ).json()
        accepted = client.post(f"/api/packs/invites/{invite['code']}/accept", headers=session)
        assert accepted.status_code == 201, accepted.text
    assert (
        client.patch(f"/api/packs/{source['id']}", headers=editor, json={"name": "Denied"}).status_code == 403
    )
    rows = [upload(client, headers, source["id"], i) for i in range(3)]
    path = f"/api/packs/{source['id']}/stickers/{rows[0]['id']}"
    assert client.patch(path, headers=viewer, json={"emojis": ["x"]}).status_code == 403
    comment = client.post(path + "/comments", headers=viewer, json={"body": "Please check"})
    assert comment.status_code == 201, comment.text
    assert client.delete(path + "/comments/" + comment.json()["id"], headers=editor).status_code == 403
    assert client.delete(path + "/comments/" + comment.json()["id"], headers=headers).status_code == 200
    for operation, row in [("copy", rows[0]), ("move", rows[1])]:
        response = client.post(
            f"/api/packs/{source['id']}/stickers/{operation}",
            headers=headers,
            json={"targetPackId": target["id"], "stickerIds": [row["id"]]},
        )
        assert response.status_code == 201, response.text
    assert client.get(f"/api/packs/{target['id']}", headers=headers).json()["stickerCount"] == 2
    activities = client.get(f"/api/packs/{target['id']}/activity", headers=headers)
    assert activities.status_code == 200 and len(activities.json()) >= 3
    assert client.delete(f"/api/packs/{target['id']}/activity", headers=viewer).status_code == 403
    assert client.delete(f"/api/packs/{target['id']}", headers=headers).status_code == 200


def test_queued_upload_export_and_failed_job_retry(client, owner):
    _, headers = owner
    pack = make_pack(client, headers)
    job = upload(client, headers, pack["id"], queued=True)
    assert job["status"] == "COMPLETED", job
    for index in [1, 2]:
        upload(client, headers, pack["id"], index)
    export = client.post(f"/api/packs/{pack['id']}/export/jobs", headers=headers)
    assert export.status_code == 202, export.text
    assert export.json()["status"] == "COMPLETED"
    failed = client.post(
        f"/api/packs/{pack['id']}/stickers/jobs",
        headers=headers,
        files={"file": ("bad.png", b"broken", "image/png")},
        data={"backgroundRemovalMode": "none"},
    )
    assert failed.status_code == 202, failed.text
    assert failed.json()["status"] == "FAILED", failed.json()
    retried = client.post(f"/api/jobs/{failed.json()['id']}/retry", headers=headers)
    assert retried.status_code == 201 and retried.json()["status"] == "FAILED", retried.text


def test_teams_create_member_demote_remove_and_owner_guard(client, owner):
    _, headers = owner
    editor_user, editor = register(client, "team-editor@example.test")
    team = client.post("/api/teams", headers=headers, json={"name": "Studio"}).json()
    member = client.post(
        f"/api/teams/{team['id']}/members",
        headers=headers,
        json={"email": editor_user["user"]["email"], "role": "EDITOR"},
    )
    assert member.status_code == 201, member.text
    pack = make_pack(client, editor, teamId=team["id"])
    assert pack["canEdit"] is True
    demoted = client.patch(
        f"/api/teams/{team['id']}/members/{member.json()['id']}", headers=headers, json={"role": "VIEWER"}
    )
    assert demoted.status_code == 200
    assert (
        client.post(
            "/api/packs", headers=editor, json={"name": "No", "publisher": "QA", "teamId": team["id"]}
        ).status_code
        == 403
    )
    assert client.get(f"/api/teams/{team['id']}/members", headers=editor).status_code == 403
    assert (
        client.delete(f"/api/teams/{team['id']}/members/{member.json()['id']}", headers=headers).status_code
        == 200
    )
