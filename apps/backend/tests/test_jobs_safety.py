from foundry.db import session_factory
from foundry.jobs import job_data
from foundry.models import MediaJob

from .conftest import register


def test_cancelled_jobs_cannot_write_and_are_owned(client, owner):
    result, headers = owner
    _, other = register(client, "other@example.test")
    with session_factory()() as db:
        job = MediaJob(user_id=result["user"]["id"], type="media", payload={})
        db.add(job)
        db.commit()
        job_id = job.id
    assert client.get(f"/api/jobs/{job_id}", headers=other).status_code == 404
    cancelled = client.post(f"/api/jobs/{job_id}/cancel", headers=headers)
    assert cancelled.status_code == 201 and cancelled.json()["status"] == "CANCELLED"
    from foundry.worker import process_job

    process_job.apply(args=[job_id], throw=True)
    with session_factory()() as db:
        current = db.get(MediaJob, job_id)
        assert current.status == "CANCELLED"
        assert current.attempts == 0
        assert "payload" not in job_data(current)


def test_readiness_metrics_and_audit_csv(client, owner):
    _, headers = owner
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/health/ready").status_code == 200
    metrics = client.get("/api/metrics")
    assert metrics.status_code == 200 and "python_version" in metrics.text
    audit = client.get("/api/admin/audit-log", headers=headers)
    assert audit.status_code == 200 and audit.json()
    exported = client.get("/api/admin/audit-log/export", headers=headers)
    assert exported.status_code == 200
    assert "actorId" in exported.text


def test_request_ids_are_captured_on_audit_rows(client, owner):
    _, headers = owner
    response = client.post(
        "/api/packs",
        headers={**headers, "X-Request-ID": "qa-request"},
        json={"name": "Audited", "publisher": "QA"},
    )
    assert response.status_code == 201
    entries = client.get("/api/admin/audit-log", headers=headers).json()
    assert any(row["requestId"] == "qa-request" for row in entries)
