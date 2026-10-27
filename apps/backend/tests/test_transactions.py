from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from foundry.main import create_app

from .conftest import register


def test_database_commit_finishes_before_success_response(client, monkeypatch):
    events = []
    commit = Session.commit

    def observed_commit(session):
        commit(session)
        events.append("commit")

    monkeypatch.setattr(Session, "commit", observed_commit)
    app = create_app()

    async def observed_app(scope, receive, send):
        async def observed_send(message):
            if message["type"] == "http.response.start":
                events.append("response")
            await send(message)

        await app(scope, receive, observed_send)

    with TestClient(observed_app) as browser:
        register(browser)
    assert events.index("commit") < events.index("response")


def test_commit_failure_cannot_return_a_success_response(client, monkeypatch):
    def failed_commit(_session):
        raise IntegrityError("INSERT", {}, RuntimeError("Constraint failed"))

    monkeypatch.setattr(Session, "commit", failed_commit)
    response = client.post(
        "/api/auth/register",
        json={"email": "failure@example.test", "displayName": "Failure", "password": "password123"},
    )
    assert response.status_code == 409
