"""Provider-neutral async Python client for Zoe's browser-control API."""
from __future__ import annotations

from typing import Any

import httpx


class ZoeAPIError(RuntimeError):
    """Raised when Zoe returns a non-success HTTP response."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Zoe API returned HTTP {status_code}: {detail}")


class ZoeClient:
    """Async client for creating and controlling isolated Zoe browser sessions.

    Example:
        async with ZoeClient() as zoe:
            async with await zoe.create_session() as browser:
                await browser.navigate("https://example.com")
                page = await browser.inspect()
    """

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8765",
        *,
        timeout: float = 60.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            transport=transport,
        )
        self._session_ids: set[str] = set()
        self._closed = False

    async def __aenter__(self) -> ZoeClient:
        self._ensure_open()
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def close(self) -> None:
        if self._closed:
            return
        try:
            for session_id in list(self._session_ids):
                try:
                    await self.close_session(session_id)
                except (ZoeAPIError, httpx.HTTPError):
                    # Closing the local client must still release its HTTP resources.
                    self._session_ids.discard(session_id)
        finally:
            self._closed = True
            await self._http.aclose()

    async def health(self) -> dict[str, Any]:
        return await self._request("GET", "/health")

    async def list_sessions(self) -> dict[str, Any]:
        return await self._request("GET", "/v1/sessions")

    async def create_session(self) -> ZoeSession:
        data = await self._request("POST", "/v1/sessions")
        session_id = str(data["session_id"])
        self._session_ids.add(session_id)
        return ZoeSession(self, session_id)

    async def close_session(self, session_id: str) -> dict[str, Any]:
        result = await self._request("DELETE", f"/v1/sessions/{session_id}")
        self._session_ids.discard(session_id)
        return result

    async def _request(
        self,
        method: str,
        path: str,
        *,
        session_id: str | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._ensure_open()
        headers = {"X-Zoe-Session-ID": session_id} if session_id else None
        try:
            response = await self._http.request(method, path, headers=headers, json=json)
        except httpx.HTTPError:
            raise
        if not response.is_success:
            try:
                payload = response.json()
                detail = str(payload.get("detail", payload))
            except ValueError:
                detail = response.text[:1000]
            raise ZoeAPIError(response.status_code, detail)
        if response.status_code == 204 or not response.content:
            return {}
        payload = response.json()
        if not isinstance(payload, dict):
            raise ZoeAPIError(response.status_code, "Expected a JSON object response.")
        return payload

    def _ensure_open(self) -> None:
        if self._closed:
            raise RuntimeError("ZoeClient is closed.")


class ZoeSession:
    """A session-scoped view that routes every operation to one isolated browser."""

    def __init__(self, client: ZoeClient, session_id: str) -> None:
        self._client = client
        self.session_id = session_id
        self._closed = False

    async def __aenter__(self) -> ZoeSession:
        self._ensure_open()
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def navigate(self, url: str) -> dict[str, Any]:
        return await self._request("POST", "/v1/browser/navigate", {"url": url})

    async def inspect(self) -> dict[str, Any]:
        return await self._request("GET", "/v1/browser/inspect")

    async def click(self, selector: str) -> dict[str, Any]:
        return await self._request("POST", "/v1/browser/click", {"selector": selector})

    async def fill(self, selector: str, text: str) -> dict[str, Any]:
        return await self._request(
            "POST", "/v1/browser/fill", {"selector": selector, "text": text}
        )

    async def semantic_action(
        self,
        *,
        action: str,
        strategy: str,
        value: str,
        role: str | None = None,
        text: str | None = None,
        exact: bool = True,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "action": action,
            "strategy": strategy,
            "value": value,
            "exact": exact,
        }
        if role is not None:
            body["role"] = role
        if text is not None:
            body["text"] = text
        return await self._request("POST", "/v1/browser/action", body)

    async def screenshot(self) -> dict[str, Any]:
        return await self._request("GET", "/v1/browser/screenshot")

    async def run_task(
        self,
        steps: list[dict[str, Any]],
        *,
        timeout_seconds: int = 45,
        stop_on_error: bool = True,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/v1/tasks/run",
            {
                "steps": steps,
                "timeout_seconds": timeout_seconds,
                "stop_on_error": stop_on_error,
            },
        )

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._client.close_session(self.session_id)

    async def _request(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        self._ensure_open()
        return await self._client._request(
            method, path, session_id=self.session_id, json=body
        )

    def _ensure_open(self) -> None:
        if self._closed:
            raise RuntimeError("ZoeSession is closed.")
        self._client._ensure_open()
