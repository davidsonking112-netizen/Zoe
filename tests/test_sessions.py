from __future__ import annotations

import asyncio

import pytest

from zoe.sessions import SessionLimitError, SessionManager, SessionNotFoundError


def test_sessions_are_distinct_and_listed() -> None:
    async def exercise() -> None:
        manager = SessionManager(max_sessions=2)
        try:
            first = await manager.create()
            second = await manager.create()
            assert first["session_id"] != second["session_id"]
            assert (await manager.get_browser(first["session_id"])) is not (
                await manager.get_browser(second["session_id"])
            )
            assert len(await manager.list_sessions()) == 2
        finally:
            await manager.close()

    asyncio.run(exercise())


def test_session_limit_is_enforced() -> None:
    async def exercise() -> None:
        manager = SessionManager(max_sessions=1)
        try:
            await manager.create()
            with pytest.raises(SessionLimitError):
                await manager.create()
        finally:
            await manager.close()

    asyncio.run(exercise())


def test_closed_session_cannot_be_reused() -> None:
    async def exercise() -> None:
        manager = SessionManager()
        try:
            session = await manager.create()
            session_id = str(session["session_id"])
            assert await manager.close_session(session_id) is True
            assert await manager.close_session(session_id) is False
            with pytest.raises(SessionNotFoundError):
                await manager.get_browser(session_id)
        finally:
            await manager.close()

    asyncio.run(exercise())


def test_idle_sessions_expire() -> None:
    async def exercise() -> None:
        manager = SessionManager(idle_ttl_seconds=10)
        try:
            session = await manager.create()
            session_id = str(session["session_id"])
            # Age the session deterministically without altering the process clock.
            manager._sessions[session_id].last_used_at -= 11
            assert await manager.list_sessions() == []
            with pytest.raises(SessionNotFoundError):
                await manager.get_browser(session_id)
        finally:
            await manager.close()

    asyncio.run(exercise())
