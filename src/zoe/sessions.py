"""Bounded, isolated browser sessions for independent agent tasks."""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass

from zoe.browser import ZoeBrowser


class SessionNotFoundError(LookupError):
    """Raised when a requested browser session does not exist or has expired."""


class SessionLimitError(RuntimeError):
    """Raised when Zoe has reached its configured active-session limit."""


@dataclass
class _Session:
    browser: ZoeBrowser
    created_at: float
    last_used_at: float


class SessionManager:
    """Own browser instances and enforce session limits and idle expiry.

    Each session receives its own Playwright/Firefox process and context. This gives
    stronger isolation than sharing a page, at the cost of higher memory usage.
    """

    def __init__(
        self,
        *,
        max_sessions: int = 4,
        idle_ttl_seconds: int = 900,
        headless: bool = True,
        navigation_timeout_ms: int = 20_000,
    ) -> None:
        if max_sessions < 1:
            raise ValueError("max_sessions must be at least 1")
        if idle_ttl_seconds < 1:
            raise ValueError("idle_ttl_seconds must be at least 1")
        self.max_sessions = max_sessions
        self.idle_ttl_seconds = idle_ttl_seconds
        self.headless = headless
        self.navigation_timeout_ms = navigation_timeout_ms
        self._sessions: dict[str, _Session] = {}
        self._lock = asyncio.Lock()
        self._default_browser = ZoeBrowser(
            headless=headless, navigation_timeout_ms=navigation_timeout_ms
        )

    @property
    def default_browser(self) -> ZoeBrowser:
        """Compatibility browser for existing single-session API clients."""
        return self._default_browser

    async def create(self) -> dict[str, object]:
        async with self._lock:
            await self._expire_idle_unlocked()
            if len(self._sessions) >= self.max_sessions:
                raise SessionLimitError("The maximum number of active sessions has been reached.")
            session_id = uuid.uuid4().hex
            now = time.monotonic()
            self._sessions[session_id] = _Session(
                browser=ZoeBrowser(
                    headless=self.headless,
                    navigation_timeout_ms=self.navigation_timeout_ms,
                ),
                created_at=now,
                last_used_at=now,
            )
            return self._describe(session_id, self._sessions[session_id])

    async def get_browser(self, session_id: str | None = None) -> ZoeBrowser:
        if session_id is None:
            return self._default_browser
        async with self._lock:
            await self._expire_idle_unlocked()
            session = self._sessions.get(session_id)
            if session is None:
                raise SessionNotFoundError("Browser session was not found or has expired.")
            session.last_used_at = time.monotonic()
            return session.browser

    async def list_sessions(self) -> list[dict[str, object]]:
        async with self._lock:
            await self._expire_idle_unlocked()
            return [
                self._describe(session_id, session)
                for session_id, session in self._sessions.items()
            ]

    async def close_session(self, session_id: str) -> bool:
        async with self._lock:
            session = self._sessions.pop(session_id, None)
        if session is None:
            return False
        await session.browser.close()
        return True

    async def close(self) -> None:
        async with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        await asyncio.gather(
            *(session.browser.close() for session in sessions),
            self._default_browser.close(),
            return_exceptions=True,
        )

    async def _expire_idle_unlocked(self) -> None:
        now = time.monotonic()
        expired_ids = [
            session_id
            for session_id, session in self._sessions.items()
            if now - session.last_used_at >= self.idle_ttl_seconds
        ]
        expired = [self._sessions.pop(session_id) for session_id in expired_ids]
        if expired:
            await asyncio.gather(
                *(session.browser.close() for session in expired),
                return_exceptions=True,
            )

    @staticmethod
    def _describe(session_id: str, session: _Session) -> dict[str, object]:
        return {
            "session_id": session_id,
            "created_at_monotonic": session.created_at,
            "last_used_at_monotonic": session.last_used_at,
            "browser_started": session.browser.started,
        }
