class DomainError(Exception):
    """A business-rule failure that an HTTP adapter can translate."""

    def __init__(self, detail: str, code: str, status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.status = status


class StorageError(Exception):
    """Storage failed; never silently reset someone's data."""
