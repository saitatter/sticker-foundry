import pytest
from foundry.config import Settings
from foundry.db import get_engine
from foundry.db_init import initialize_database
from sqlalchemy import inspect, text


def test_schema_initializer_never_resets_unrecognized_data(client):
    engine = get_engine()
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE unrelated_data (value TEXT NOT NULL)"))
        connection.execute(text("INSERT INTO unrelated_data VALUES ('keep')"))
    with pytest.raises(RuntimeError, match="no data was changed"):
        initialize_database()
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT value FROM unrelated_data")) == "keep"
    assert "users" in inspect(engine).get_table_names()


def test_production_refuses_example_secrets_and_wildcard_origins():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(_env_file=None, app_env="production", jwt_secret="change-this-long-random-secret")
    with pytest.raises(ValueError, match="CORS_ORIGIN"):
        Settings(_env_file=None, app_env="production", jwt_secret="a" * 48, cors_origin="*")
    assert Settings(
        _env_file=None, app_env="production", jwt_secret="a" * 48, cors_origin="https://stickers.example.test"
    ).origins == ["https://stickers.example.test"]
