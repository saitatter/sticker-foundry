import json

import pytest

from tool.phone_qa import (
    APP,
    PhoneSession,
    interactive_step,
    load_flow,
    redacted_hierarchy,
    replay_suite,
    target_obscured,
    validate_step,
)


def test_recorded_commands_keep_credentials_in_environment_references():
    step = interactive_step("input --label Password --env QA_PASSWORD")
    assert step == {"action": "input", "selector": {"label": "Password"}, "env": "QA_PASSWORD"}
    with pytest.raises(ValueError, match="environment"):
        interactive_step("input --label Password --value private")
    with pytest.raises(ValueError, match="between 0 and 1"):
        interactive_step("tap-point --point 500 600")
    assert interactive_step("tap-point --point .5 .7")["point"] == [0.5, 0.7]
    assert interactive_step("long-tap --description-contains Sticker --instance 1")["selector"] == {
        "descriptionContains": "Sticker",
        "instance": 1,
    }
    assert interactive_step("drag --start .3 .4 --end .6 .7 --duration .8")["duration"] == 0.8
    assert interactive_step('assert --description "Dark theme" --checked')["selector"]["checked"] is True
    assert interactive_step('assert --description "Dark theme" --no-checked')["selector"]["checked"] is False
    assert interactive_step("launch --restart")["restart"] is True
    with pytest.raises(ValueError, match="boolean"):
        validate_step({"action": "launch", "restart": "yes"})
    with pytest.raises(ValueError, match="boolean"):
        validate_step({"action": "assert", "selector": {"description": "Dark theme", "checked": 1}})


def test_scenarios_reject_arbitrary_commands_and_unknown_versions(tmp_path):
    with pytest.raises(ValueError, match="Unknown"):
        validate_step({"action": "shell", "value": "anything"})
    with pytest.raises(ValueError, match="Unsupported fields"):
        validate_step({"action": "tap", "selector": {"label": "Save"}, "value": "unexpected"})
    path = tmp_path / "flow.json"
    path.write_text(json.dumps({"version": 2, "steps": [{"action": "launch"}]}), encoding="utf-8")
    with pytest.raises(ValueError, match="version 1"):
        load_flow(path)


class Target:
    exists = True
    count = 1
    info = {"bounds": {"left": 0, "top": 100, "right": 100, "bottom": 200}, "focused": True}

    def __init__(self, device):
        self.device = device

    def click(self):
        self.device.calls.append("click")

    def set_text(self, value):
        self.device.calls.append(value)


class Device:
    def __init__(self):
        self.package = APP
        self.calls = []
        self.queries = []
        self.starts = []

    def app_current(self):
        raise AssertionError("Android 16 task history is not a foreground-app signal")

    @property
    def info(self):
        return {"currentPackageName": self.package}

    def app_start(self, package, **_kwargs):
        self.package = package
        self.starts.append((package, _kwargs))

    def __call__(self, **selector):
        self.queries.append(selector)
        return Target(self)

    def screenshot(self, path):
        self.calls.append(path)

    def dump_hierarchy(self, **_kwargs):
        return '<hierarchy><node password="true" text="private" content-desc="private"/></hierarchy>'


def test_replay_logs_selectors_and_evidence_without_secret_values(tmp_path, monkeypatch):
    monkeypatch.setenv("QA_PASSWORD", "test-only-secret")
    device = Device()
    output = tmp_path / "evidence"
    session = PhoneSession(device, output)
    session.execute({"action": "input", "selector": {"label": "Password"}, "env": "QA_PASSWORD"})
    report = (output / "report.json").read_text(encoding="utf-8")
    assert '"passed": true' in report
    assert "QA_PASSWORD" in report and "test-only-secret" not in report
    assert "test-only-secret" in device.calls
    assert device.calls[:2] == ["click", "test-only-secret"]
    assert all(query["packageName"] == APP and query["enabled"] for query in device.queries)
    assert "private" not in (output / "001-input.xml").read_text(encoding="utf-8")


def test_replay_never_interacts_with_unapproved_foreground_apps(tmp_path):
    device = Device()
    device.package = "personal.application"
    session = PhoneSession(device, tmp_path / "evidence")
    with pytest.raises(RuntimeError, match="outside"):
        session.execute({"action": "tap", "selector": {"label": "Save"}})
    assert device.calls == []
    assert not json.loads((tmp_path / "evidence/report.json").read_text(encoding="utf-8"))["passed"]
    assert "private" not in redacted_hierarchy(device.dump_hierarchy())


def test_restart_launch_requests_an_actual_application_restart(tmp_path):
    device = Device()
    session = PhoneSession(device, tmp_path / "evidence")
    session.execute({"action": "launch", "restart": True})
    assert device.starts == [(APP, {"activity": "com.stickerfoundry.app.MainActivity", "stop": True})]


def test_app_links_keep_tokens_in_environment_references(tmp_path, monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setenv("QA_RESET_LINK", "http://example.test/reset-password?token=private-link-token")
    device = Device()
    device.shell = lambda command: SimpleNamespace(output="Starting activity", exit_code=0)
    session = PhoneSession(device, tmp_path / "evidence")
    session.execute({"action": "open-link", "env": "QA_RESET_LINK"})
    report = (session.output / "report.json").read_text(encoding="utf-8")
    assert "QA_RESET_LINK" in report
    assert "private-link-token" not in report
    with pytest.raises(ValueError, match="environment"):
        validate_step({"action": "open-link"})


def test_hierarchy_excludes_other_apps_and_system_notifications():
    xml = (
        '<hierarchy><node package="com.android.systemui" text="notification"/>'
        f'<node package="{APP}" text="Library"><node package="com.whatsapp" '
        'text="external"/></node></hierarchy>'
    )
    result = redacted_hierarchy(xml)
    assert "Library" in result
    assert "notification" not in result and "external" not in result
    assert "external" in redacted_hierarchy(xml, {APP, "com.whatsapp"})


def test_video_finalization_rejects_missing_remote_file(tmp_path, monkeypatch):
    from types import SimpleNamespace

    device = Device()
    device.shell = lambda _command: SimpleNamespace(output="", exit_code=1)
    monkeypatch.setattr("tool.phone_qa.time.sleep", lambda _seconds: None)
    session = PhoneSession(device, tmp_path / "evidence", video=True)
    session.recording = 42, "/sdcard/foundry-qa-test.mp4"
    with pytest.raises(RuntimeError, match="missing or empty"):
        session.stop_video()
    assert not (session.output / "screen.mp4").exists()


def test_notifications_block_taps_but_status_and_navigation_bars_do_not():
    bounds = {"left": 100, "top": 150, "right": 200, "bottom": 250}
    bars = '<node package="com.android.systemui" bounds="[0,0][1000,100]"/>'
    assert not target_obscured(f"<hierarchy>{bars}</hierarchy>", APP, bounds)
    banner = '<node package="com.android.systemui" bounds="[0,100][1000,400]"/>'
    assert target_obscured(f"<hierarchy>{bars}{banner}</hierarchy>", APP, bounds)


def test_suite_reports_coverage_and_stops_after_a_failed_scenario(tmp_path):
    paths = []
    for index, package in enumerate([APP, "personal.application", APP]):
        path = tmp_path / f"{index}-flow.json"
        path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "covers": [f"feature.{index}"],
                    "steps": [{"action": "launch", "package": package}],
                }
            ),
            encoding="utf-8",
        )
        paths.append(path)
    output = tmp_path / "suite"
    with pytest.raises(ValueError, match="not enabled"):
        replay_suite(Device(), paths, output)
    result = json.loads((output / "suite-report.json").read_text(encoding="utf-8"))
    assert not result["passed"]
    assert [entry["status"] for entry in result["scenarios"]] == ["passed", "failed", "not_run"]
    assert result["scenarios"][0]["covers"] == ["feature.0"]
