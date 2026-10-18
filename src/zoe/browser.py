"""Playwright-managed Firefox runtime for Zoe's initial single-session milestone."""
from __future__ import annotations

import asyncio
import base64
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from zoe.security import UnsafeDestinationError, validate_public_http_url


class BrowserNotStartedError(RuntimeError):
    """Raised when a browser operation requires an unavailable page."""


class ZoeBrowser:
    """A lazily-started Firefox runtime with a single page.

    This class is intentionally single-session in v0.1. Do not share one instance
    between untrusted users or independent concurrent agents.
    """

    def __init__(self, *, headless: bool = True, navigation_timeout_ms: int = 20_000) -> None:
        self.headless = headless
        self.navigation_timeout_ms = navigation_timeout_ms
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._lock = asyncio.Lock()

    @property
    def started(self) -> bool:
        return self._browser is not None and self._browser.is_connected()

    async def start(self) -> None:
        async with self._lock:
            if self.started:
                return
            self._playwright = await async_playwright().start()
            try:
                self._browser = await self._playwright.firefox.launch(headless=self.headless)
                self._context = await self._browser.new_context(
                    accept_downloads=False,
                    service_workers="block",
                )
                await self._context.route("**/*", self._guard_request)
                self._page = await self._context.new_page()
                self._page.set_default_timeout(self.navigation_timeout_ms)
                self._page.set_default_navigation_timeout(self.navigation_timeout_ms)
            except Exception:
                await self._cleanup_unlocked()
                raise

    async def _guard_request(self, route: Any) -> None:
        try:
            validate_public_http_url(route.request.url)
        except UnsafeDestinationError:
            await route.abort("blockedbyclient")
            return
        await route.continue_()

    def _require_page(self) -> Page:
        if self._page is None or self._page.is_closed():
            raise BrowserNotStartedError("Browser is not started. Navigate to a URL first.")
        return self._page

    async def navigate(self, url: str) -> dict[str, Any]:
        safe_url = validate_public_http_url(url)
        await self.start()
        page = self._require_page()
        response = await page.goto(safe_url, wait_until="domcontentloaded")
        return {
            "success": response is None or response.ok,
            "url": page.url,
            "title": await page.title(),
            "http_status": response.status if response is not None else None,
        }

    async def inspect(self) -> dict[str, Any]:
        page = self._require_page()
        data = await page.evaluate(
            """() => {
              const visible = (el) => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.visibility !== 'hidden' && style.display !== 'none' &&
                       rect.width > 0 && rect.height > 0;
              };
              const fullText = document.body?.innerText || '';
              const elements = Array.from(document.querySelectorAll(
                'a[href],button,input,textarea,select,[role="button"],[role="link"]'
              )).filter(visible).slice(0, 100).map((el, index) => ({
                index,
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute('role'),
                text: (el.innerText || el.value || '').trim().slice(0, 240),
                aria_label: el.getAttribute('aria-label'),
                placeholder: el.getAttribute('placeholder'),
                name: el.getAttribute('name'),
                type: el.getAttribute('type'),
                href: el.tagName === 'A' ? el.href : null,
                disabled: Boolean(el.disabled)
              }));
              return { text: fullText.slice(0, 12000), elements,
                       truncated: fullText.length > 12000 };
            }"""
        )
        return {
            "url": page.url,
            "title": await page.title(),
            "text": data["text"],
            "interactive_elements": data["elements"],
            "text_truncated": data["truncated"],
        }

    async def click(self, selector: str) -> dict[str, Any]:
        page = self._require_page()
        await page.locator(selector).first.click()
        return {"success": True, "url": page.url, "title": await page.title()}

    async def fill(self, selector: str, text: str) -> dict[str, Any]:
        page = self._require_page()
        await page.locator(selector).first.fill(text)
        return {"success": True, "selector": selector}

    async def screenshot(self) -> dict[str, str]:
        page = self._require_page()
        image = await page.screenshot(type="png", full_page=False, animations="disabled")
        return {
            "encoding": "base64",
            "mime_type": "image/png",
            "data": base64.b64encode(image).decode("ascii"),
        }

    async def _cleanup_unlocked(self) -> None:
        if self._context is not None:
            try:
                await self._context.close()
            except Exception:
                pass
            self._context = None
        if self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._playwright is not None:
            try:
                await self._playwright.stop()
            except Exception:
                pass
            self._playwright = None
        self._page = None

    async def close(self) -> None:
        async with self._lock:
            await self._cleanup_unlocked()
