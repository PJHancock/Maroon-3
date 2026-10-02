"""Thin HTTP adapters: validation in models, rules in services."""

from fastapi import APIRouter, Depends, Request

from .errors import DomainError
from .models import (
    Contact, ContactCreate, ContactUpdate, DraftRequest, DraftResponse,
    HistoryRequest, OnboardingRequest, RadarResponse, RemindersResponse,
    ResearchResponse, ScoreResponse, StartResponse, StateResponse, SuggestionsResponse,
    Task, TaskAcceptRequest, TaskComplete, TaskContext, TaskPrepResponse,
    TaskProposalResponse, TaskResponse, TurnResponse,
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


@router.get("/tasks/{id}/prep", response_model=TaskPrepResponse, tags=["Tasks"])
def task_prep(id: str, service: BuddyService = Depends(get_service)):
    return service.task_prep(id)


@router.post("/tasks/{id}/context", response_model=TaskContext, tags=["Tasks"])
def set_task_context(id: str, body: TaskContext, service: BuddyService = Depends(get_service)):
    return service.set_task_context(id, body).prep_context


@router.delete("/tasks/{id}/context", response_model=Task, tags=["Tasks"])
def clear_task_context(id: str, service: BuddyService = Depends(get_service)):
    return service.clear_task_context(id)


@router.post("/contacts", response_model=Contact, status_code=201, tags=["Contacts"])
def add_contact(body: ContactCreate, service: BuddyService = Depends(get_service)):
    return service.add_contact(body)


@router.put("/contacts/{id}", response_model=Contact, tags=["Contacts"])
def update_contact(id: str, body: ContactUpdate, service: BuddyService = Depends(get_service)):
    return service.update_contact(id, body)


@router.patch("/contacts/{id}", response_model=Contact, tags=["Contacts"])
def patch_contact(id: str, body: ContactUpdate, service: BuddyService = Depends(get_service)):
    return service.update_contact(id, body)


@router.delete("/contacts/{id}", tags=["Contacts"])
def delete_contact(id: str, service: BuddyService = Depends(get_service)):
    return service.delete_contact(id)


@router.get("/opportunities", response_model=ResearchResponse, tags=["Research"])
async def opportunities(refresh: bool = False, service: BuddyService = Depends(get_service)):
    return await service.opportunities(refresh=refresh)


@router.post("/opportunities/{id}/radar", response_model=RadarResponse, tags=["Research"])
async def save_opportunity(id: str, service: BuddyService = Depends(get_service)):
    return await service.set_radar(id, True)


@router.delete("/opportunities/{id}/radar", response_model=RadarResponse, tags=["Research"])
async def remove_opportunity(id: str, service: BuddyService = Depends(get_service)):
    return await service.set_radar(id, False)


@router.post("/coach/reminders", response_model=RemindersResponse, tags=["Coach"])
async def reminders(service: BuddyService = Depends(get_service)):
    return await service.reminders()


@router.post("/coach/draft", response_model=DraftResponse, tags=["Coach"])
async def draft(body: DraftRequest, service: BuddyService = Depends(get_service)):
    return await service.draft(body)


@router.post("/coach/suggest", response_model=SuggestionsResponse, tags=["Coach"])
async def suggest(body: DraftRequest, service: BuddyService = Depends(get_service)):
    return await service.suggest(body)


@router.post("/coach/propose-tasks", response_model=TaskProposalResponse, tags=["Coach"])
async def propose_tasks(service: BuddyService = Depends(get_service)):
    return await service.propose_tasks()


@router.post("/tasks/{id}/accept", response_model=Task, tags=["Tasks"])
def accept_task(id: str, body: TaskAcceptRequest, service: BuddyService = Depends(get_service)):
    return service.accept_task(id, body)


@router.post("/tasks/{id}/reject", tags=["Tasks"])
def reject_task(id: str, service: BuddyService = Depends(get_service)):
    return service.reject_task(id)


@router.post("/onboarding", response_model=StateResponse, tags=["Onboarding"])
def onboarding(body: OnboardingRequest, service: BuddyService = Depends(get_service)):
    return service.complete_onboarding(body)


@router.post("/reset", response_model=StateResponse, tags=["Demo"])
def reset(request: Request, service: BuddyService = Depends(get_service)):
    if not request.app.state.settings.allow_reset:
        raise DomainError("Reset is disabled", "reset_disabled", 403)
    return service.reset()


@router.get("/health", tags=["Demo"])
def health(request: Request):
    return {"status": "ok", "mode": "demo" if request.app.state.settings.demo_mode else "live"}
