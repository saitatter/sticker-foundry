import logging
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import get_settings

log = logging.getLogger(__name__)


def after_commit(db, action):
    db.info.setdefault("commit_actions", []).append(action)


def after_rollback(db, action):
    db.info.setdefault("rollback_actions", []).append(action)


@event.listens_for(Session, "after_commit")
def finish_files(db):
    db.info.pop("rollback_actions", None)
    for action in db.info.pop("commit_actions", []):
        try:
            action()
        except Exception:
            log.exception("Committed successfully, but obsolete media cleanup failed")


@event.listens_for(Session, "after_rollback")
def rollback_files(db):
    db.info.pop("commit_actions", None)
    for action in reversed(db.info.pop("rollback_actions", [])):
        try:
            action()
        except Exception:
            log.exception("Could not remove staged media after rollback")


@lru_cache
def get_engine():
    url = get_settings().sqlalchemy_url
    options = {"pool_pre_ping": True, "hide_parameters": True}
    if url.startswith("sqlite"):
        options.update(connect_args={"check_same_thread": False})
        if ":memory:" in url:
            options["poolclass"] = StaticPool
    engine = create_engine(url, **options)
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def sqlite_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    return engine


def session_factory():
    return sessionmaker(get_engine(), expire_on_commit=False)


@contextmanager
def transaction():
    with session_factory()() as db:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            rollback_files(db)
            raise


def get_db():
    with Session(get_engine(), expire_on_commit=False) as db:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            rollback_files(db)
            raise
