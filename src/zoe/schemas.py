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
