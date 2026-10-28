"""Replay phone acceptance against an isolated local Docker QA project."""

import argparse
import io
import json
import os
import secrets
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

import httpx2
from PIL import Image

from tool.phone_fixtures import generate
from tool.phone_qa import APP, PhoneSession, replay_suite
from tool.phone_scenarios import (
    cleanup_scenarios,
    nav,
    offline_scenario,
    scenarios,
    tap,
    whatsapp_scenarios,
)

ROOT = Path(__file__).resolve().parents[1]


def validate_target(project, port, backend, postgres):
    if project != "sticker-foundry-device-qa" and not project.startswith("sticker-foundry-device-qa-"):
        raise ValueError("Use a dedicated sticker-foundry-device-qa Docker project")
    for container in (backend, postgres):
        if container.get("Config", {}).get("Labels", {}).get("com.docker.compose.project") != project:
            raise ValueError("QA containers must belong to the requested project")
    bindings = backend.get("NetworkSettings", {}).get("Ports", {}).get("3000/tcp") or []
    if not any(item.get("HostPort") == str(port) for item in bindings):
        raise ValueError("The API port does not belong to this QA backend")
    mounts = [
        m for m in postgres.get("Mounts", []) if m.get("Destination", "").startswith("/var/lib/postgresql")
    ]
    if not mounts or any(
        m.get("Type") != "volume" or not m.get("Name", "").startswith(project + "_") for m in mounts
    ):
        raise ValueError("The QA database must use its own project volume, never a live database or backup")
    backend_env = dict(
        value.split("=", 1) for value in backend.get("Config", {}).get("Env", []) if "=" in value
    )
    postgres_env = dict(
        value.split("=", 1) for value in postgres.get("Config", {}).get("Env", []) if "=" in value
    )
    database = urlsplit(backend_env.get("DATABASE_URL", ""))
    if (
        not database.scheme.startswith("postgresql")
        or database.hostname != "postgres"
        or database.port not in {None, 5432}
        or unquote(database.path.lstrip("/")) != postgres_env.get("POSTGRES_DB")
        or any(
            host.split(":", 1)[0] == "postgres"
            for host in backend.get("HostConfig", {}).get("ExtraHosts", []) or []
        )
    ):
        raise ValueError("The backend must use the isolated PostgreSQL service, never an external database")


def inspect_service(project, service):
    result = subprocess.check_output(
        [
            "docker",
            "ps",
            "--filter",
            f"label=com.docker.compose.project={project}",
            "--filter",
            f"label=com.docker.compose.service={service}",
            "--format",
            "{{.ID}}",
        ],
        text=True,
    ).split()
    if len(result) != 1:
        raise RuntimeError(f"Start exactly one {service} container in the dedicated QA project")
    return json.loads(subprocess.check_output(["docker", "inspect", result[0]], text=True))[0]


def device_preferences(device):
    result = device.shell(["run-as", APP, "cat", "shared_prefs/FlutterSharedPreferences.xml"])
    if result.exit_code != 0:
        raise RuntimeError(
            "Install the debug APK and configure its isolated QA server before running this suite"
        )
    root = ET.fromstring(result.output)
    server = next((n.text for n in root if n.get("name") == "flutter.server"), None)
    dark = next((n.get("value") == "true" for n in root if n.get("name") == "flutter.dark"), False)
    return server, dark


def bootstrap(device, output, video):
    session = PhoneSession(device, output, video=video, covers=["environment.setup"])
    try:
        session.execute({"action": "launch", "restart": True})
        deadline = time.monotonic() + 30
        while not device(packageName=APP, description="Sign in").exists:
            if device(packageName=APP, descriptionContains="Settings\nTab").exists:
                session.execute(nav("Settings"))
                for _ in range(3):
                    if device(packageName=APP, description="Sign out").exists:
                        break
                    session.execute({"action": "swipe", "start": [0.5, 0.82], "end": [0.5, 0.28]})
                session.execute(tap("Sign out"))
                session.execute({"action": "assert", "selector": {"label": "Sign in"}, "timeout": 30})
                break
            if time.monotonic() > deadline:
                raise RuntimeError("The app did not reach its sign-in or account screen")
            time.sleep(0.2)
    finally:
        try:
            session.stop_video()
        finally:
            session.report()


def write_flows(output, flows):
    output.mkdir(parents=True)
    paths = []
    for name, flow in flows:
        path = output / f"{name}.json"
        path.write_text(json.dumps(flow, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        paths.append(path)
    return paths


def validate_export(client, pack, *, animated):
    response = client.get(f"packs/{pack['id']}/export")
    response.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert all(not n.startswith("/") and ".." not in n and "\\" not in n for n in archive.namelist())
        manifest = json.loads(archive.read("contents.json"))["sticker_packs"][0]
        assert manifest["animated_sticker_pack"] is animated and len(manifest["stickers"]) == 3
        assert Image.open(io.BytesIO(archive.read(manifest["tray_image_file"]))).size == (96, 96)
        for sticker in manifest["stickers"]:
            content = archive.read(sticker["image_file"])
            image = Image.open(io.BytesIO(content))
            assert image.size == (512, 512)
            assert bool(getattr(image, "is_animated", False)) is animated
            assert len(content) <= (500 if animated else 100) * 1024
    return {"animated": animated, "stickers": 3, "validated": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--project", default="sticker-foundry-device-qa")
    parser.add_argument("--port", type=int, default=13002)
    parser.add_argument("--video", action="store_true")
    parser.add_argument("--whatsapp", action="store_true")
    parser.add_argument("--offline", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--keep-packs", action="store_true")
    args = parser.parse_args()
    backend, postgres = inspect_service(args.project, "backend"), inspect_service(args.project, "postgres")
    validate_target(args.project, args.port, backend, postgres)
    import uiautomator2 as u2

    device = u2.connect(args.serial)
    device.jsonrpc.setConfigurator({"waitForIdleTimeout": 500, "waitForSelectorTimeout": 0})
    server, dark = device_preferences(device)
    base = f"http://127.0.0.1:{args.port}/api/"
    if server != base:
        raise RuntimeError(
            "Select the isolated QA API in the app's server settings before running this suite"
        )
    device.adb_device.reverse(f"tcp:{args.port}", f"tcp:{args.port}")
    run = uuid.uuid4().hex[:8]
    output = ROOT / "test-results" / "phone-smoke" / run
    output.mkdir(parents=True)
    print(f"Phone QA evidence: {output}", flush=True)
    credentials = {
        "QA_EMAIL": f"phone-qa-{run}@example.test",
        "QA_PASSWORD": secrets.token_urlsafe(24),
        "QA_EMOJI": "\U0001f642",
    }
    (output / "credentials.json").write_text(json.dumps(credentials, indent=2) + "\n", encoding="utf-8")
    os.environ.update(credentials)
    names = {kind: f"QA {run} {kind}" for kind in ("static", "animated", "target")}
    picker = "com.google.android.documentsui"
    allowed = [picker, "com.android.documentsui", *(["com.whatsapp"] if args.whatsapp else [])]
    summary = {"passed": False, "project": args.project, "serial": args.serial, "names": names, "stages": []}

    def ensure_route():
        device.adb_device.reverse(f"tcp:{args.port}", f"tcp:{args.port}")

    def stage(name, flows, *, online=True):
        paths = write_flows(output / "flows" / name, flows)
        print(f"Running {name}: {len(paths)} scenarios", flush=True)
        replay_suite(
            device, paths, output / name, allowed, args.video, before_step=ensure_route if online else None
        )
        summary["stages"].append({"stage": name, "passed": True})

    with httpx2.Client(base_url=base, timeout=90) as client:
        response = client.get("health/ready")
        response.raise_for_status()
        response = client.post(
            "auth/register",
            json={
                "email": credentials["QA_EMAIL"],
                "password": credentials["QA_PASSWORD"],
                "displayName": "Phone QA",
            },
        )
        response.raise_for_status()
        try:
            fixtures = output / "fixtures"
            generate(fixtures)
            device.shell(["mkdir", "-p", "/sdcard/Download/Foundry-QA"])
            for path in sorted(fixtures.iterdir()):
                remote = f"/sdcard/Download/Foundry-QA/{path.name}"
                device.push(str(path), remote)
                device.shell(
                    [
                        "am",
                        "broadcast",
                        "-a",
                        "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
                        "-d",
                        f"file://{remote}",
                    ]
                )
            bootstrap(device, output / "setup", args.video)
            stage("core", scenarios(names, picker, initial_dark=dark))
            response = client.post(
                "auth/login", json={"email": credentials["QA_EMAIL"], "password": credentials["QA_PASSWORD"]}
            )
            response.raise_for_status()
            client.headers["Authorization"] = "Bearer " + response.json()["accessToken"]
            response = client.get("packs")
            response.raise_for_status()
            packs = {p["name"]: p for p in response.json()}
            assert packs[names["target"]]["stickerCount"] == 3
            assert packs[names["animated"] + " Copy"]["stickerCount"] == 2
            checks = [
                validate_export(client, packs[names[kind]], animated=kind == "animated")
                for kind in ("static", "animated")
            ]
            detail = client.get(f"packs/{packs[names['static']]['id']}")
            detail.raise_for_status()
            assert detail.json()["stickers"][0]["accessibilityText"] == ""
            assert detail.json()["stickers"][0]["emojis"] == [credentials["QA_EMOJI"]]
            summary["exports"] = checks
            if args.whatsapp:
                stage("whatsapp", whatsapp_scenarios(names))
            if args.offline:
                try:
                    device.adb_device.reverse_remove(f"tcp:{args.port}")
                    stage("offline", offline_scenario(names), online=False)
                finally:
                    device.adb_device.reverse(f"tcp:{args.port}", f"tcp:{args.port}")
                stage(
                    "reconnect",
                    [
                        (
                            "reconnect",
                            {
                                "version": 1,
                                "covers": ["offline.reconnect"],
                                "steps": [
                                    {"action": "launch", "restart": True},
                                    {"action": "assert", "selector": {"label": "Your library"}},
                                    {
                                        "action": "absent",
                                        "selector": {"descriptionContains": "downloaded packs"},
                                    },
                                ],
                            },
                        )
                    ],
                )
            stage("cleanup", cleanup_scenarios(names, keep_packs=args.keep_packs))
            summary["passed"] = True
            print("Phone acceptance passed", flush=True)
        finally:
            (output / "report.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
