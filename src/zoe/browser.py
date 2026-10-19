"""Playwright-managed Firefox runtime for Zoe's initial single-session milestone."""
from __future__ import annotations

import asyncio
import base64
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from zoe.security import UnsafeDestinationError, redact_sensitive_url, validate_public_http_url


class BrowserNotStartedError(RuntimeError):
    """Raised when a browser operation requires an unavailable page."""


class LocatorNotFoundError(LookupError):
    """Raised when a semantic locator matches no elements."""


class AmbiguousLocatorError(ValueError):
    """Raised when a semantic locator matches more than one element."""


class BrowserPool:
    """Own one Firefox process and provide it to isolated browser contexts."""

    def __init__(self, *, headless: bool = True) -> None:
        self.headless = headless
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()

    async def get_browser(self) -> Browser:
        async with self._lock:
            if self._browser is not None and self._browser.is_connected():
                return self._browser
            await self._stop_unlocked()
            self._playwright = await async_playwright().start()
            try:
                self._browser = await self._playwright.firefox.launch(headless=self.headless)
            except Exception:
                await self._stop_unlocked()
                raise
            return self._browser

    async def close(self) -> None:
        async with self._lock:
            await self._stop_unlocked()

    async def _stop_unlocked(self) -> None:
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


class ZoeBrowser:
    """A lazily-started Firefox page inside its own isolated browser context."""

    def __init__(
        self,
        *,
        headless: bool = True,
        navigation_timeout_ms: int = 20_000,
        browser_pool: BrowserPool | None = None,
    ) -> None:
        self.headless = headless
        self.navigation_timeout_ms = navigation_timeout_ms
        self._browser_pool = browser_pool
        self._owns_browser = browser_pool is None
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
            try:
                if self._browser_pool is None:
                    self._playwright = await async_playwright().start()
                    self._browser = await self._playwright.firefox.launch(headless=self.headless)
                else:
                    self._browser = await self._browser_pool.get_browser()
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
            "url": redact_sensitive_url(page.url),
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
                text: (el.innerText || '').trim().slice(0, 240),
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
            "url": redact_sensitive_url(page.url),
            "title": await page.title(),
            "text": data["text"],
            "interactive_elements": [
                {**element, "href": redact_sensitive_url(element["href"]) if element["href"] else None}
                for element in data["elements"]
            ],
            "text_truncated": data["truncated"],
        }

    async def click(self, selector: str) -> dict[str, Any]:
        page = self._require_page()
        await page.locator(selector).first.click()
        return {"success": True, "url": redact_sensitive_url(page.url), "title": await page.title()}

    async def fill(self, selector: str, text: str) -> dict[str, Any]:
        page = self._require_page()
        await page.locator(selector).first.fill(text)
        return {"success": True, "selector": selector}

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
        """Perform an action only when a semantic locator matches exactly one element."""
        page = self._require_page()
        if strategy == "role":
            if not role:
                raise ValueError("The role strategy requires a role.")
            locator = page.get_by_role(role, name=value, exact=exact)
        elif strategy == "label":
            locator = page.get_by_label(value, exact=exact)
        elif strategy == "text":
            locator = page.get_by_text(value, exact=exact)
        elif strategy == "placeholder":
            locator = page.get_by_placeholder(value, exact=exact)
        elif strategy == "test_id":
            locator = page.get_by_test_id(value)
        else:
            raise ValueError("Unsupported locator strategy.")

        count = await locator.count()
        if count == 0:
            raise LocatorNotFoundError("The semantic locator did not match any elements.")
        if count > 1:
            raise AmbiguousLocatorError(
                f"The semantic locator matched {count} elements; refine it to match exactly one."
            )

        if action == "click":
            await locator.click()
        elif action == "fill":
            if text is None:
                raise ValueError("The fill action requires text.")
            await locator.fill(text)
        else:
            raise ValueError("Unsupported semantic action.")

        return {
            "success": True,
            "action": action,
            "strategy": strategy,
            "matched_count": count,
            "url": redact_sensitive_url(page.url),
            "title": await page.title(),
        }

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
        if self._owns_browser and self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                pass
        self._browser = None
        if self._owns_browser and self._playwright is not None:
            try:
                await self._playwright.stop()
            except Exception:
                pass
        self._playwright = None
        self._page = None

    async def close(self) -> None:
        async with self._lock:
            await self._cleanup_unlocked()
