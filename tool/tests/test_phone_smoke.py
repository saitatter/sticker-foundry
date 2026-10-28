import copy

import pytest

from tool.phone_smoke import validate_target


def containers():
    project = "sticker-foundry-device-qa"
    backend = {
        "Config": {
            "Labels": {"com.docker.compose.project": project},
            "Env": ["DATABASE_URL=postgresql+psycopg://postgres/qa"],
        },
        "NetworkSettings": {"Ports": {"3000/tcp": [{"HostPort": "13002"}]}},
    }
    postgres = {
        "Config": {"Labels": {"com.docker.compose.project": project}, "Env": ["POSTGRES_DB=qa"]},
        "Mounts": [
            {"Type": "volume", "Name": project + "_postgres-data", "Destination": "/var/lib/postgresql"}
        ],
    }
    return project, backend, postgres


def test_phone_setup_requires_the_isolated_project_and_its_published_api_port():
    project, backend, postgres = containers()
    validate_target(project, 13002, backend, postgres)
    with pytest.raises(ValueError, match="dedicated"):
        validate_target("sticker-foundry-production", 13002, backend, postgres)
    with pytest.raises(ValueError, match="port"):
        validate_target(project, 8080, backend, postgres)


@pytest.mark.parametrize(
    "mount",
    [
        {"Type": "bind", "Source": "C:/backups/live", "Destination": "/var/lib/postgresql"},
        {"Type": "volume", "Name": "production_postgres-data", "Destination": "/var/lib/postgresql"},
    ],
)
def test_phone_setup_rejects_live_or_backup_storage(mount):
    project, backend, postgres = containers()
    postgres = copy.deepcopy(postgres)
    postgres["Mounts"] = [mount]
    with pytest.raises(ValueError, match="live database or backup"):
        validate_target(project, 13002, backend, postgres)


def test_phone_setup_rejects_an_external_database_even_when_a_qa_volume_exists():
    project, backend, postgres = containers()
    backend["Config"]["Env"] = ["DATABASE_URL=postgresql+psycopg://production.example/live"]
    with pytest.raises(ValueError, match="never an external database"):
        validate_target(project, 13002, backend, postgres)
