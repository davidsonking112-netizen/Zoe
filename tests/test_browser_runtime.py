import asyncio

from zoe.browser import ZoeBrowser


def test_firefox_runtime_starts_inspects_and_closes() -> None:
    async def exercise_runtime() -> None:
        browser = ZoeBrowser()
        try:
            await browser.start()
            assert browser.started is True
            observation = await browser.inspect()
            assert observation["url"] == "about:blank"
            assert observation["interactive_elements"] == []
        finally:
            await browser.close()
        assert browser.started is False

    asyncio.run(exercise_runtime())


def test_inspection_never_exposes_form_values_and_redacts_sensitive_link_urls() -> None:
    async def exercise_runtime() -> None:
        browser = ZoeBrowser()
        try:
            await browser.start()
            page = browser._page
            assert page is not None
            await page.set_content(
                """<!doctype html><title>Privacy fixture</title>
                <label>Username <input name="username" value="ordinary-field-secret"></label>
                <label>Password <input type="password" name="password" value="password-field-secret"></label>
                <textarea name="notes">textarea-secret</textarea>
                <a href="https://example.test/account?access_token=url-secret&tab=home">Account</a>"""
            )
            observation = await browser.inspect()
            serialized = str(observation)
            for secret in (
                "ordinary-field-secret",
                "password-field-secret",
                "textarea-secret",
                "url-secret",
            ):
                assert secret not in serialized
            account_link = next(
                element for element in observation["interactive_elements"]
                if element["text"] == "Account"
            )
            assert "access_token=%5Bredacted%5D" in account_link["href"]
            assert "tab=home" in account_link["href"]
        finally:
            await browser.close()

    asyncio.run(exercise_runtime())
