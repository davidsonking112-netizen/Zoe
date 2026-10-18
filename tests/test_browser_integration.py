"""End-to-end browser tests against a deterministic local fixture page.

The test-only URL validator exception is scoped to this module and the fixture's
loopback URL. Production URL validation remains unchanged.
"""
from __future__ import annotations

import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import urlsplit

import pytest

import zoe.browser as browser_module
from zoe.browser import ZoeBrowser
from zoe.security import validate_public_http_url as validate_real_url


HTML = """<!doctype html>
<html lang="en">
  <head><title>Zoe Fixture</title></head>
  <body>
    <main>
      <h1>Browser integration fixture</h1>
      <label for="query">Query</label>
      <input id="query" name="query" placeholder="Enter a query">
      <button id="submit" type="button"
        onclick="document.querySelector('#result').textContent =
          'Submitted: ' + document.querySelector('#query').value">
        Submit query
      </button>
      <p id="result" role="status">Not submitted</p>
    </main>
  </body>
</html>
"""


class _FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        body = HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        # Keep test output deterministic and quiet.
        return


@pytest.fixture
def fixture_url(monkeypatch: pytest.MonkeyPatch) -> str:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FixtureHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/"

    def test_scoped_url_validation(candidate: str) -> str:
        parsed = urlsplit(candidate)
        if parsed.hostname == "127.0.0.1" and parsed.port == server.server_port:
            if parsed.scheme != "http":
                raise ValueError("The test fixture only accepts HTTP.")
            return candidate
        return validate_real_url(candidate)

    # Both top-level navigation and intercepted subrequests use this module-level
    # function. No production setting or environment variable disables the guard.
    monkeypatch.setattr(browser_module, "validate_public_http_url", test_scoped_url_validation)
    try:
        yield url
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_navigation_inspection_fill_and_click(fixture_url: str) -> None:
    async def exercise() -> None:
        browser = ZoeBrowser()
        try:
            result = await browser.navigate(fixture_url)
            assert result["success"] is True
            assert result["http_status"] == 200
            assert result["title"] == "Zoe Fixture"

            observation = await browser.inspect()
            assert "Browser integration fixture" in observation["text"]
            assert any(
                element["text"] == "Submit query"
                for element in observation["interactive_elements"]
            )

            await browser.fill("#query", "weather in Lagos")
            await browser.click("#submit")

            updated = await browser.inspect()
            assert "Submitted: weather in Lagos" in updated["text"]
            assert updated["url"] == fixture_url
        finally:
            await browser.close()

    asyncio.run(exercise())
