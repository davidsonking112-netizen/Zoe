"""Request and response schemas for the local Zoe API."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator


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


class SemanticActionRequest(BaseModel):
    action: Literal["click", "fill"]
    strategy: Literal["role", "label", "text", "placeholder", "test_id"]
    value: str = Field(min_length=1, max_length=500)
    role: str | None = Field(default=None, max_length=100)
    text: str | None = Field(default=None, max_length=20_000)
    exact: bool = True

    @model_validator(mode="after")
    def validate_action_fields(self) -> "SemanticActionRequest":
        if self.strategy == "role" and not self.role:
            raise ValueError("role is required when strategy is 'role'.")
        if self.action == "fill" and self.strategy not in {"label", "placeholder", "test_id"}:
            raise ValueError("fill supports label, placeholder, or test_id locators.")
        if self.action == "fill" and self.text is None:
            raise ValueError("text is required when action is 'fill'.")
        return self
