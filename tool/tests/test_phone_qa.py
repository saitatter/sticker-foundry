import json

import pytest

from tool.phone_qa import (
    APP,
    PhoneSession,
    interactive_step,
    load_flow,
    redacted_hierarchy,
    replay_suite,
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

    def app_current(self):
        return {"package": self.package}

    def app_start(self, package, **_kwargs):
        self.package = package

    def __call__(self, **_selector):
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
