from __future__ import annotations

import asyncio

import httpx
import pytest

from zoe.client import ZoeAPIError, ZoeClient


def test_client_routes_session_operations_and_closes_context() -> None:
    seen: list[tuple[str, str, str | None]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path, request.headers.get("X-Zoe-Session-ID")))
        if request.method == "POST" and request.url.path == "/v1/sessions":
            return httpx.Response(201, json={"session_id": "session-test"})
        if request.url.path == "/v1/browser/navigate":
            return httpx.Response(
                200,
                json={"success": True, "url": "https://example.com", "title": "Example", "http_status": 200},
            )
        if request.url.path == "/v1/browser/inspect":
            return httpx.Response(200, json={"url": "https://example.com", "title": "Example", "text": "Hello"})
        if request.method == "DELETE" and request.url.path == "/v1/sessions/session-test":
            return httpx.Response(200, json={"closed": True, "session_id": "session-test"})
        return httpx.Response(404, json={"detail": "unexpected request"})

    async def exercise() -> None:
        transport = httpx.MockTransport(handler)
        async with ZoeClient(transport=transport) as client:
            async with await client.create_session() as session:
                assert session.session_id == "session-test"
                navigation = await session.navigate("https://example.com")
                assert navigation["success"] is True
                observation = await session.inspect()
                assert observation["text"] == "Hello"
        assert ("POST", "/v1/browser/navigate", "session-test") in seen
        assert ("GET", "/v1/browser/inspect", "session-test") in seen
        assert ("DELETE", "/v1/sessions/session-test", None) in seen

    asyncio.run(exercise())


def test_client_converts_api_errors_to_structured_exception() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"detail": "session limit reached"})

    async def exercise() -> None:
        async with ZoeClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ZoeAPIError) as caught:
                await client.create_session()
            assert caught.value.status_code == 429
            assert caught.value.detail == "session limit reached"

    asyncio.run(exercise())


def test_client_rejects_use_after_close() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    async def exercise() -> None:
        client = ZoeClient(transport=httpx.MockTransport(handler))
        await client.close()
        with pytest.raises(RuntimeError, match="closed"):
            await client.health()

    asyncio.run(exercise())
