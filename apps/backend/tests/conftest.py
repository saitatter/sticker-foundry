import os

os.environ["TESTING"] = "true"

import pytest
from fastapi.testclient import TestClient
from foundry.config import get_settings
from foundry.db import get_engine
from foundry.db_init import initialize_database
from foundry.health import get_redis
from foundry.main import create_app
from foundry.storage import get_storage


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "media"))
    monkeypatch.setenv("EXPORT_CACHE_DIR", str(tmp_path / "exports"))
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-" + "x" * 40)
    monkeypatch.setenv("BACKGROUND_REMOVAL_COMMAND", "")
    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_storage.cache_clear()
    get_redis.cache_clear()
    initialize_database()
    with TestClient(create_app()) as browser:
        yield browser
    get_engine().dispose()
    get_engine.cache_clear()


def register(client, email="owner@example.test", name="Owner"):
    response = client.post(
        "/api/auth/register", json={"email": email, "displayName": name, "password": "password123"}
    )
    assert response.status_code == 201, response.text
    result = response.json()
    return result, {"Authorization": "Bearer " + result["accessToken"]}


@pytest.fixture
def owner(client):
    return register(client)
