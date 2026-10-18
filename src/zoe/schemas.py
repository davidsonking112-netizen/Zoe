"""Request and response schemas for the local Zoe API."""
from pydantic import BaseModel, Field


class NavigateRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class SelectorRequest(BaseModel):
    selector: str = Field(min_length=1, max_length=1000)


class FillRequest(SelectorRequest):
    text: str = Field(max_length=20_000)


class NavigationResult(BaseModel):
    success: bool = True
    url: str
    title: str
    http_status: int | None = None


class HealthResult(BaseModel):
    status: str = "ok"
    browser_started: bool
    version: str


class CreateSessionResult(BaseModel):
    session_id: str
    created_at_monotonic: float
    last_used_at_monotonic: float
    browser_started: bool = False


class SessionListResult(BaseModel):
    sessions: list[CreateSessionResult]
    active_sessions: int
    max_sessions: int


class CloseSessionResult(BaseModel):
    closed: bool
    session_id: str
