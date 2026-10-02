"""Thin HTTP adapters: validation in models, rules in services."""

from fastapi import APIRouter, Depends, Request

from .errors import DomainError
from .models import (
    Contact, ContactCreate, DraftRequest, DraftResponse, HistoryRequest,
    RemindersResponse, ScoreResponse, StartResponse, StateResponse,
    TaskComplete, TaskResponse, TurnResponse,
)
from .services import BuddyService

router = APIRouter(prefix="/api")


def get_service(request: Request) -> BuddyService:
    return request.app.state.buddy


@router.get("/state", response_model=StateResponse, tags=["Home"])
def state(service: BuddyService = Depends(get_service)):
    return service.state()


@router.post("/games/{game}/start", response_model=StartResponse, tags=["Games"])
async def start(game: str, service: BuddyService = Depends(get_service)):
    return await service.start(game)


@router.post("/games/{game}/turn", response_model=TurnResponse, tags=["Games"])
async def turn(game: str, body: HistoryRequest, service: BuddyService = Depends(get_service)):
    return await service.turn(game, body)


@router.post("/games/{game}/score", response_model=ScoreResponse, tags=["Games"])
async def score(game: str, body: HistoryRequest, service: BuddyService = Depends(get_service)):
    return await service.score(game, body)


@router.post("/tasks/{id}/complete", response_model=TaskResponse, tags=["Tasks"])
def complete_task(id: str, body: TaskComplete, service: BuddyService = Depends(get_service)):
    return service.complete_task(id, body)


@router.post("/contacts", response_model=Contact, status_code=201, tags=["Contacts"])
def add_contact(body: ContactCreate, service: BuddyService = Depends(get_service)):
    return service.add_contact(body)


@router.post("/coach/reminders", response_model=RemindersResponse, tags=["Coach"])
async def reminders(service: BuddyService = Depends(get_service)):
    return await service.reminders()


@router.post("/coach/draft", response_model=DraftResponse, tags=["Coach"])
async def draft(body: DraftRequest, service: BuddyService = Depends(get_service)):
    return await service.draft(body)


@router.post("/reset", response_model=StateResponse, tags=["Demo"])
def reset(request: Request, service: BuddyService = Depends(get_service)):
    if not request.app.state.settings.allow_reset:
        raise DomainError("Reset is disabled", "reset_disabled", 403)
    return service.reset()


@router.get("/health", tags=["Demo"])
def health(request: Request):
    return {"status": "ok", "mode": "demo" if request.app.state.settings.demo_mode else "live"}
