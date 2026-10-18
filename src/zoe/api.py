"""FastAPI entry point for Zoe's local browser-control API."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from zoe import __version__
from zoe.browser import BrowserNotStartedError
from zoe.schemas import (
    CloseSessionResult,
    CreateSessionResult,
    FillRequest,
    HealthResult,
    NavigateRequest,
    NavigationResult,
    SelectorRequest,
    SessionListResult,
)
from zoe.security import UnsafeDestinationError
from zoe.sessions import SessionLimitError, SessionManager, SessionNotFoundError


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.sessions = SessionManager()
    yield
    await app.state.sessions.close()


app = FastAPI(
    title="Zoe Browser API",
    version=__version__,
    description="A local, experimental browser-control API for AI agents.",
    lifespan=lifespan,
)


def _sessions() -> SessionManager:
    return app.state.sessions


async def _browser(session_id: str | None = None):
    try:
        return await _sessions().get_browser(session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _raise_browser_error(exc: Exception) -> None:
    if isinstance(exc, UnsafeDestinationError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(exc, BrowserNotStartedError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, PlaywrightTimeoutError):
        raise HTTPException(status_code=504, detail="Browser operation timed out.") from exc
    if isinstance(exc, PlaywrightError):
        raise HTTPException(status_code=502, detail=f"Browser operation failed: {exc}") from exc
    raise exc


@app.get("/health", response_model=HealthResult, tags=["system"])
async def health() -> HealthResult:
    """Report API health without launching a browser."""
    sessions = getattr(app.state, "sessions", None)
    browser = sessions.default_browser if sessions is not None else None
    return HealthResult(
        browser_started=bool(browser and browser.started),
        version=__version__,
    )


@app.post("/v1/sessions", response_model=CreateSessionResult, tags=["sessions"], status_code=201)
async def create_session() -> dict[str, object]:
    """Create an isolated browser session for one agent or task."""
    try:
        return await _sessions().create()
    except SessionLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc


@app.get("/v1/sessions", response_model=SessionListResult, tags=["sessions"])
async def list_sessions() -> dict[str, object]:
    """List active sessions without exposing browser page contents."""
    sessions = await _sessions().list_sessions()
    return {
        "sessions": sessions,
        "active_sessions": len(sessions),
        "max_sessions": _sessions().max_sessions,
    }


@app.delete(
    "/v1/sessions/{session_id}",
    response_model=CloseSessionResult,
    tags=["sessions"],
)
async def close_session(session_id: str) -> dict[str, object]:
    """Close and remove an isolated browser session."""
    closed = await _sessions().close_session(session_id)
    if not closed:
        raise HTTPException(status_code=404, detail="Browser session was not found.")
    return {"closed": True, "session_id": session_id}


@app.post("/v1/browser/navigate", response_model=NavigationResult, tags=["browser"])
async def navigate(
    request: NavigateRequest,
    x_zoe_session_id: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        browser = await _browser(x_zoe_session_id)
        return await browser.navigate(request.url)
    except Exception as exc:
        _raise_browser_error(exc)
        raise


@app.get("/v1/browser/inspect", tags=["browser"])
async def inspect(
    x_zoe_session_id: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        browser = await _browser(x_zoe_session_id)
        return await browser.inspect()
    except Exception as exc:
        _raise_browser_error(exc)
        raise


@app.post("/v1/browser/click", tags=["browser"])
async def click(
    request: SelectorRequest,
    x_zoe_session_id: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        browser = await _browser(x_zoe_session_id)
        return await browser.click(request.selector)
    except Exception as exc:
        _raise_browser_error(exc)
        raise


@app.post("/v1/browser/fill", tags=["browser"])
async def fill(
    request: FillRequest,
    x_zoe_session_id: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        browser = await _browser(x_zoe_session_id)
        return await browser.fill(request.selector, request.text)
    except Exception as exc:
        _raise_browser_error(exc)
        raise


@app.get("/v1/browser/screenshot", tags=["browser"])
async def screenshot(
    x_zoe_session_id: str | None = Header(default=None),
) -> dict[str, str]:
    try:
        browser = await _browser(x_zoe_session_id)
        return await browser.screenshot()
    except Exception as exc:
        _raise_browser_error(exc)
        raise
