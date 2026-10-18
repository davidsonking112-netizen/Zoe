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
