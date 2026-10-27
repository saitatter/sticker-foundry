"""Record and replay Android QA steps with semantic selectors and private evidence."""

import argparse
import json
import os
import shlex
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from pathlib import Path

APP = "com.stickerfoundry.app"
ROOT = Path(__file__).resolve().parents[1]
SELECTORS = {
    "label",
    "text",
    "description",
    "resourceId",
    "className",
    "textContains",
    "descriptionContains",
    "instance",
}
ACTIONS = {
    "launch",
    "tap",
    "long-tap",
    "input",
    "assert",
    "absent",
    "press",
    "tap-point",
    "swipe",
    "drag",
    "checkpoint",
}


def validate_step(step):
    if not isinstance(step, dict) or step.get("action") not in ACTIONS:
        raise ValueError("Unknown step action")
    action = step["action"]
    fields = {
        "launch": {"package"},
        "tap": {"selector"},
        "long-tap": {"selector"},
        "assert": {"selector"},
        "absent": {"selector"},
        "input": {"selector", "env", "value"},
        "press": {"key"},
        "tap-point": {"point"},
        "swipe": {"start", "end", "duration"},
        "drag": {"start", "end", "duration"},
        "checkpoint": set(),
    }
    if set(step) - {"action", "timeout"} - fields[action]:
        raise ValueError("Unsupported fields for this action")
    if action in {"tap", "long-tap", "input", "assert", "absent"}:
        selector = step.get("selector")
        if not isinstance(selector, dict) or not selector or set(selector) - SELECTORS:
            raise ValueError("A supported semantic selector is required")
        if "label" in selector and len(selector) != 1:
            raise ValueError("label matches either exact text or description; use it alone")
        if any(not isinstance(value, str) for key, value in selector.items() if key != "instance"):
            raise ValueError("Selector values must be text")
        if "instance" in selector and (type(selector["instance"]) is not int or selector["instance"] < 0):
            raise ValueError("instance must be a nonnegative integer")
    if action == "input":
        if ("env" in step) == ("value" in step):
            raise ValueError("Input requires exactly one of env or value")
        if not isinstance(step.get("env", step.get("value")), str):
            raise ValueError("Input source must be text")
        label = " ".join(str(value) for value in step["selector"].values()).lower()
        if "value" in step and any(word in label for word in ("password", "parola", "secret", "token")):
            raise ValueError("Use an environment variable for secret inputs")
    if action == "press" and step.get("key") not in {"back", "enter", "search", "delete"}:
        raise ValueError("Unsupported key")
    for name in {"tap-point": ("point",), "swipe": ("start", "end"), "drag": ("start", "end")}.get(
        action, ()
    ):
        point = step.get(name)
        if (
            not isinstance(point, list)
            or len(point) != 2
            or any(type(v) not in {float, int} or not 0 <= v <= 1 for v in point)
        ):
            raise ValueError("Canvas coordinates must be normalized pairs between 0 and 1")
    timeout = step.get("timeout", 15)
    if type(timeout) not in {int, float} or not 0 < timeout <= 120:
        raise ValueError("Timeout must be between 0 and 120 seconds")
    if action in {"swipe", "drag"} and not 0 < step.get("duration", 0.4) <= 10:
        raise ValueError("Swipe duration must be between 0 and 10 seconds")
    return step


def load_flow(path):
    flow = json.loads(Path(path).read_text(encoding="utf-8"))
    if (
        not isinstance(flow, dict)
        or type(flow.get("version")) is not int
        or flow["version"] != 1
        or not isinstance(flow.get("steps"), list)
        or not flow["steps"]
    ):
        raise ValueError("Expected a version 1 scenario with steps")
    for step in flow["steps"]:
        validate_step(step)
    return flow


def redacted_hierarchy(xml):
    root = ET.fromstring(xml)
    for node in root.iter():
        if node.get("password") == "true":
            for child in node.iter():
                child.set("text", "[redacted]")
                child.set("content-desc", "[redacted]")
    return ET.tostring(root, encoding="unicode")


class PhoneSession:
    def __init__(self, device, output, allowed_packages=(), video=False, covers=()):
        self.device = device
        self.output = Path(output)
        self.output.mkdir(parents=True, exist_ok=False)
        self.allowed = {APP, *allowed_packages}
        self.video = video
        self.covers = list(covers)
        self.recording = None
        self.results = []

    def guard(self):
        package = self.device.app_current().get("package")
        if package not in self.allowed:
            raise RuntimeError(f"Foreground package {package!r} is outside this QA session")

    def find(self, selector, timeout, *, exists=True):
        choices = (
            [{"description": selector["label"]}, {"text": selector["label"]}]
            if "label" in selector
            else [selector]
        )
        deadline = time.monotonic() + timeout
        while True:
            self.guard()
            found = None
            for query in choices:
                target = self.device(**query)
                if target.exists:
                    if target.count != 1:
                        raise AssertionError("Selector is ambiguous; make it more specific")
                    found = target
                    break
            if (found is not None) == exists:
                return found if exists else True
            if time.monotonic() >= deadline:
                return None
            time.sleep(0.15)

    def snapshot(self, stem):
        self.guard()
        self.device.screenshot(str(self.output / f"{stem}.png"))
        xml = self.device.dump_hierarchy(compressed=False)
        (self.output / f"{stem}.xml").write_text(redacted_hierarchy(xml), encoding="utf-8")

    def start_video(self):
        self.guard()
        remote = f"/sdcard/foundry-qa-{uuid.uuid4().hex}.mp4"
        result = self.device.shell(
            ["sh", "-c", f"screenrecord --time-limit 180 {remote} >/dev/null 2>&1 & echo $!"]
        )
        pid = int(result.output.strip())
        if result.exit_code != 0 or pid <= 1:
            raise RuntimeError("Could not start Android screen recording")
        self.recording = pid, remote

    def stop_video(self):
        if self.recording is None:
            return
        pid, remote = self.recording
        self.recording = None
        command = self.device.shell(["cat", f"/proc/{pid}/cmdline"]).output
        if "screenrecord" in command and remote in command:
            self.device.shell(["kill", "-2", str(pid)])
        for _ in range(25):
            if self.device.shell(["kill", "-0", str(pid)]).exit_code != 0:
                break
            time.sleep(0.2)
        self.device.pull(remote, str(self.output / "screen.mp4"))
        self.device.shell(["rm", remote])

    def execute(self, step):
        validate_step(step)
        action, started = step["action"], time.monotonic()
        item = {"step": step, "status": "failed"}
        try:
            if action == "launch":
                package = step.get("package", APP)
                if package not in self.allowed:
                    raise ValueError("Launching this package is not enabled for this session")
                self.device.app_start(package, wait=True)
            else:
                self.guard()
            if action in {"tap", "long-tap", "input", "assert", "absent"}:
                target = self.find(step["selector"], step.get("timeout", 15), exists=action != "absent")
                if target is None:
                    raise AssertionError(
                        "Selected element did not disappear"
                        if action == "absent"
                        else "Selected element did not appear"
                    )
                elif action == "tap":
                    target.click()
                elif action == "long-tap":
                    target.long_click()
                elif action == "input":
                    value = os.environ[step["env"]] if "env" in step else step["value"]
                    try:
                        target.set_text(value)
                    except Exception:
                        raise RuntimeError("Input failed for the selected field") from None
            elif action == "press":
                self.device.press(step["key"])
            elif action in {"tap-point", "swipe", "drag"}:
                width, height = self.device.window_size()

                def coordinates(point):
                    return min(width - 1, round(point[0] * width)), min(height - 1, round(point[1] * height))

                if action == "tap-point":
                    self.device.click(*coordinates(step["point"]))
                else:
                    gesture = self.device.drag if action == "drag" else self.device.swipe
                    gesture(
                        *coordinates(step["start"]),
                        *coordinates(step["end"]),
                        duration=step.get("duration", 0.4),
                    )
            self.guard()
            if self.video and self.recording is None:
                self.start_video()
            self.snapshot(f"{len(self.results) + 1:03d}-{action}")
            item["status"] = "passed"
        except Exception as error:
            item["error"] = str(error)
            try:
                self.snapshot(f"{len(self.results) + 1:03d}-failure")
            except Exception:
                pass
            raise
        finally:
            item["seconds"] = round(time.monotonic() - started, 3)
            self.results.append(item)
            self.report()

    def report(self):
        result = {
            "covers": self.covers,
            "package": APP,
            "steps": self.results,
            "passed": bool(self.results) and all(step["status"] == "passed" for step in self.results),
        }
        (self.output / "report.json").write_text(
            json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )


def replay_suite(device, paths, output, allowed_packages=(), video=False):
    flows = [load_flow(path) for path in paths]
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    results = [
        {"scenario": path.name, "covers": flow.get("covers", []), "status": "not_run"}
        for path, flow in zip(paths, flows, strict=True)
    ]
    try:
        for index, flow in enumerate(flows):
            session = PhoneSession(
                device,
                output / f"{index + 1:03d}-{paths[index].stem}",
                allowed_packages,
                video,
                flow.get("covers", []),
            )
            try:
                for step in flow["steps"]:
                    session.execute(step)
                results[index]["status"] = "passed"
            except Exception as error:
                results[index].update(status="failed", error=str(error))
                raise
            finally:
                try:
                    session.stop_video()
                except Exception:
                    results[index].update(status="failed", error="Could not finalize video evidence")
                    raise
                finally:
                    session.report()
    finally:
        report = {
            "scenarios": results,
            "passed": bool(results) and all(item["status"] == "passed" for item in results),
        }
        (output / "suite-report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )


def interactive_step(line):
    parser = argparse.ArgumentParser(prog="step", exit_on_error=False)
    parser.add_argument("action", choices=sorted(ACTIONS))
    parser.add_argument("--label")
    parser.add_argument("--text")
    parser.add_argument("--description")
    parser.add_argument("--id", dest="resourceId")
    parser.add_argument("--text-contains", dest="textContains")
    parser.add_argument("--description-contains", dest="descriptionContains")
    parser.add_argument("--class", dest="className")
    parser.add_argument("--instance", type=int)
    parser.add_argument("--env")
    parser.add_argument("--value")
    parser.add_argument("--key")
    parser.add_argument("--package")
    parser.add_argument("--point", type=float, nargs=2)
    parser.add_argument("--start", type=float, nargs=2)
    parser.add_argument("--end", type=float, nargs=2)
    parser.add_argument("--duration", type=float)
    parser.add_argument("--timeout", type=float)
    values = {
        key: value for key, value in vars(parser.parse_args(shlex.split(line))).items() if value is not None
    }
    selector = {key: values.pop(key) for key in SELECTORS if key in values}
    if selector:
        values["selector"] = selector
    return validate_step(values)


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial")
    parser.add_argument("--allow-package", action="append", default=[])
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--video", action="store_true", help="Record up to 180 seconds of Android screen video"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("record", "replay", "validate"):
        command = commands.add_parser(name)
        command.add_argument("flow", type=Path)
        if name == "record":
            command.add_argument("--covers", nargs="+", default=[])
    commands.add_parser("inspect")
    args = parser.parse_args()
    if args.command == "validate":
        flow = load_flow(args.flow)
        print(f"Valid scenario: {len(flow['steps'])} steps")
        return
    if args.command == "record" and args.flow.exists():
        parser.error("Choose a new scenario file; existing recordings are preserved")
    paths = []
    if args.command == "replay":
        paths = (
            sorted(path for path in args.flow.glob("*.json") if not path.name.endswith(".sample.json"))
            if args.flow.is_dir()
            else [args.flow]
        )
        if not paths:
            parser.error("No recorded scenarios found; sample scenarios are excluded from suites")
        for path in paths:
            load_flow(path)
    flow = {"version": 1, "covers": getattr(args, "covers", []), "steps": []}
    # Imports and device connection happen only after offline validation.
    import uiautomator2 as u2

    device = u2.connect(args.serial)
    device.jsonrpc.setConfigurator({"waitForIdleTimeout": 0, "waitForSelectorTimeout": 0})
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    output = args.output or ROOT / "test-results/android" / stamp
    print(f"Evidence: {output}")
    if args.command == "replay":
        replay_suite(device, paths, output, args.allow_package, args.video)
        return
    session = PhoneSession(device, output, args.allow_package, args.video, flow["covers"])
    try:
        if args.command == "inspect":
            session.snapshot("inspect")
            print((output / "inspect.xml").read_text(encoding="utf-8"))
        else:
            print(
                'Commands: launch; tap --label "Create pack"; input --label Email --env QA_EMAIL; assert --label "Your library"; save'
            )
            while True:
                line = input("phone> ").strip()
                if line in {"save", "quit"}:
                    break
                if not line:
                    continue
                try:
                    step = interactive_step(line)
                    session.execute(step)
                    flow["steps"].append(step)
                    args.flow.parent.mkdir(parents=True, exist_ok=True)
                    args.flow.write_text(
                        json.dumps(flow, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
                    )
                except SystemExit:
                    print("Invalid command; see the step options above")
                except Exception as error:
                    print(f"Step not recorded: {error}")
    finally:
        try:
            session.stop_video()
        finally:
            session.report()


if __name__ == "__main__":
    main()
