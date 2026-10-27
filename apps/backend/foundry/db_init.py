"""Initialize an empty application database. Never reset or adapt an existing schema."""

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from .db import get_engine
from .models import Base, SchemaInfo


def initialize_database():
    engine = get_engine()
    tables = set(inspect(engine).get_table_names())
    expected = set(Base.metadata.tables)
    if tables:
        if tables != expected:
            raise RuntimeError(
                "The database does not match the application schema. Use an empty application database; no data was changed."
            )
        with Session(engine) as db:
            if db.scalar(select(SchemaInfo.version).where(SchemaInfo.id == 1)) != 1:
                raise RuntimeError("Unsupported database schema version; no data was changed.")
        return
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(SchemaInfo(id=1, version=1))
        db.commit()


if __name__ == "__main__":
    initialize_database()
