"""FastAPI entry point for Zoe's local browser-control API."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from playwright.async_api import Error as PlaywrightError, TimeoutError as PlaywrightTimeoutError

from zoe import __version__
from zoe.browser import BrowserNotStartedError, ZoeBrowser
from zoe.schemas import FillRequest, HealthResult, NavigateRequest, NavigationResult, SelectorRequest
from zoe.security import UnsafeDestinationError


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.browser = ZoeBrowser()
    yield
    await app.state.browser.close()


app = FastAPI(
    title="Zoe Browser API",
    version=__version__,
    description="A local, experimental browser-control API for AI agents.",
    lifespan=lifespan,
)


def _browser() -> ZoeBrowser:
    return app.state.browser


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
    """Report API health without launching the browser."""
    browser = getattr(app.state, "browser", None)
    return HealthResult(browser_started=bool(browser and browser.started), version=__version__)


@app.post("/v1/browser/navigate", response_model=NavigationResult, tags=["browser"])
async def navigate(request: NavigateRequest) -> dict[str, Any]:
    try:
        return await _browser().navigate(request.url)
    except Exception as exc:
        _raise_browser_error(exc)
        raise


@app.get("/v1/browser/inspect", tags=["browser"])
async def inspect() -> dict[str, Any]:
    try:
        return await _browser().inspect()
    except Exception as exc:
        _raise_browser_error(exc)
        raise


@app.post("/v1/browser/click", tags=["browser"])
async def click(request: SelectorRequest) -> dict[str, Any]:
    try:
        return await _browser().click(request.selector)
    except Exception as exc:
        _raise_browser_error(exc)
        raise


@app.post("/v1/browser/fill", tags=["browser"])
async def fill(request: FillRequest) -> dict[str, Any]:
    try:
        return await _browser().fill(request.selector, request.text)
    except Exception as exc:
        _raise_browser_error(exc)
        raise


@app.get("/v1/browser/screenshot", tags=["browser"])
async def screenshot() -> dict[str, str]:
    try:
        return await _browser().screenshot()
    except Exception as exc:
        _raise_browser_error(exc)
        raise
