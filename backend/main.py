"""Composition root: configure resources, mount routes, then serve B/C's files."""

# Support both `uvicorn backend.main:app` at the repo root and the build plan's
# `uvicorn main:app` when launched inside backend/.
if not __package__:
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "backend"

import logging
from contextlib import asynccontextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from .config import Settings, get_settings
from .db import JsonRepository
from .demo import DemoAI
from .errors import DomainError, StorageError
from .llm import ClaudeAI, ClaudeTransport
from .routes import router
from .services import BuddyService

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, *, repository=None, ai=None, today=None) -> FastAPI:
    settings = settings or get_settings()
    store = repository or JsonRepository(settings.db_path, settings.seed_path)

    def app_today():
        if settings.demo_mode and settings.demo_date:
            return settings.demo_date
        return datetime.now(ZoneInfo(settings.timezone)).date()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if isinstance(store, JsonRepository):
            store.initialize()
        transport = None
        if ai is not None:
            engine = ai
        elif settings.demo_mode:
            engine = DemoAI()
        else:
            transport = ClaudeTransport(settings.api_key, settings.model, settings.llm_timeout)
            engine = ClaudeAI(transport, settings.llm_timeout)
        app.state.settings = settings
        app.state.buddy = BuddyService(store, engine, today or app_today, settings.demo_mode)
        try:
            yield
        finally:
            if transport:
                await transport.close()

    app = FastAPI(title="Networking Buddy API", version="0.1.0", lifespan=lifespan)
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                           allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError):
        return JSONResponse(status_code=error.status, content={"detail": error.detail, "code": error.code})

    @app.exception_handler(StorageError)
    async def storage_error(request: Request, error: StorageError):
        logger.error("Database operation failed (%s)", type(error).__name__)
        return JSONResponse(status_code=503, content={"detail": "Data could not be saved or loaded. Try again.", "code": "storage_unavailable"})

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        # Omit the rejected input and exception objects; keep field locations.
        issues = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in error.errors()]
        return JSONResponse(status_code=422, content=jsonable_encoder({"detail": issues, "code": "validation_error"}))

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        return JSONResponse(status_code=error.status_code,
                            content={"detail": error.detail, "code": "http_error"}, headers=error.headers)

    @app.middleware("http")
    async def no_stale_state(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(router)

    # Register API fallthrough before the frontend so a typo is a JSON 404.
    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    async def unknown_api(path: str):
        raise DomainError("API route not found", "route_not_found", 404)

    @app.get("/", include_in_schema=False)
    async def index():
        index_path = settings.frontend_dir / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)
        return HTMLResponse('<!doctype html><meta name="viewport" content="width=device-width">'
                            '<title>Networking Buddy backend</title><h1>Backend ready</h1>'
                            '<p>Add the team\'s files to frontend/ to load the app.</p>'
                            '<p><a href="/docs">Try the API</a> · <a href="/api/state">Demo state</a></p>')

    app.mount("/", StaticFiles(directory=str(settings.frontend_dir), html=True, check_dir=False), name="frontend")
    return app


app = create_app()
