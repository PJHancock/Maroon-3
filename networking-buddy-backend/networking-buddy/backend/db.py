"""Single-process JSON repository with serialized, atomic transactions.

Run one Uvicorn worker. Locks are deliberately held only around disk reads,
business mutations, and writes, never while waiting for an LLM.
"""

import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from threading import RLock
from typing import Protocol, TypeVar

from pydantic import ValidationError

from .errors import StorageError
from .models import Database

T = TypeVar("T")


class Repository(Protocol):
    def load_db(self) -> Database: ...
    def update(self, mutate: Callable[[Database], T]) -> T: ...
    def reset_db(self) -> Database: ...


class JsonRepository:
    def __init__(self, path: Path, seed_path: Path):
        self.path = path
        self.seed_path = seed_path
        self._lock = RLock()

    def _read(self, path: Path) -> Database:
        try:
            return Database.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValidationError) as exc:
            raise StorageError(f"Unable to read valid database: {path.name}") from exc

    def initialize(self) -> None:
        with self._lock:
            if not self.path.exists():
                self._write(self._read(self.seed_path))
            else:
                self._read(self.path)

    def load_db(self) -> Database:
        with self._lock:
            return self._read(self.path)

    def _write(self, database: Database) -> None:
        temp_path = None
        try:
            # Validate the entire snapshot before committing it.
            data = Database.model_validate(database.model_dump()).model_dump_json(indent=2)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=self.path.parent,
                prefix=self.path.name + ".", suffix=".tmp", delete=False,
            ) as stream:
                temp_path = Path(stream.name)
                stream.write(data + "\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_path, self.path)
        except (OSError, ValidationError) as exc:
            raise StorageError("Unable to save database") from exc
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

    def save_db(self, database: Database) -> None:
        """Whole-snapshot write; use update() for read-modify-write operations."""
        with self._lock:
            self._write(database)

    def update(self, mutate: Callable[[Database], T]) -> T:
        with self._lock:
            database = self._read(self.path)
            result = mutate(database)
            self._write(database)
            return result

    def reset_db(self) -> Database:
        with self._lock:
            database = self._read(self.seed_path)
            self._write(database)
            return database
