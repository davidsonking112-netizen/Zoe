from __future__ import annotations

import asyncio

import pytest
from pydantic import ValidationError

from zoe.tasks import TaskRequest, TaskStep, run_task


class FakeBrowser:
    def __init__(self) -> None:
        self.url = "about:blank"
        self.text = ""
        self.calls: list[str] = []

    async def navigate(self, url: str) -> dict[str, object]:
        self.calls.append("navigate")
        self.url = url
        self.text = "Zoe test page"
        return {"success": True, "url": url, "title": "Zoe", "http_status": 200}

    async def inspect(self) -> dict[str, object]:
        self.calls.append("inspect")
        return {"url": self.url, "title": "Zoe", "text": self.text}

    async def click(self, selector: str) -> dict[str, object]:
        self.calls.append("click")
        if selector == "#missing":
            raise LookupError("not found")
        self.text += " Submitted"
        return {"success": True, "url": self.url, "title": "Zoe"}

    async def fill(self, selector: str, text: str) -> dict[str, object]:
        self.calls.append("fill")
        return {"success": True, "selector": selector}

    async def semantic_action(self, **kwargs: object) -> dict[str, object]:
        self.calls.append("semantic_action")
        return {"success": True, **kwargs}


def test_task_runs_steps_and_verifies_result() -> None:
    async def exercise() -> None:
        browser = FakeBrowser()
        request = TaskRequest(steps=[
            TaskStep(action="navigate", url="https://example.com"),
            TaskStep(action="click", selector="#submit"),
            TaskStep(action="verify_text", expected="Submitted"),
            TaskStep(action="verify_url", expected="example.com"),
        ])
        result = await run_task(browser, request)
        assert result.success is True
        assert result.completed_steps == 4
        assert result.total_steps == 4
        assert result.stopped_at_step is None
        assert all(step.success for step in result.steps)

    asyncio.run(exercise())


def test_task_stops_on_first_failure_by_default() -> None:
    async def exercise() -> None:
        browser = FakeBrowser()
        request = TaskRequest(steps=[
            TaskStep(action="click", selector="#missing"),
            TaskStep(action="inspect"),
        ])
        result = await run_task(browser, request)
        assert result.success is False
        assert result.stopped_at_step == 1
        assert len(result.steps) == 1
        assert browser.calls == ["click"]

    asyncio.run(exercise())


def test_task_can_continue_after_failure_when_configured() -> None:
    async def exercise() -> None:
        browser = FakeBrowser()
        request = TaskRequest(
            stop_on_error=False,
            steps=[
                TaskStep(action="click", selector="#missing"),
                TaskStep(action="inspect"),
            ],
        )
        result = await run_task(browser, request)
        assert result.success is False
        assert len(result.steps) == 2
        assert browser.calls == ["click", "inspect"]

    asyncio.run(exercise())


def test_task_request_has_bounded_step_count_and_timeout() -> None:
    with pytest.raises(ValidationError):
        TaskRequest(steps=[TaskStep(action="inspect")] * 21)
    with pytest.raises(ValidationError):
        TaskRequest(steps=[TaskStep(action="inspect")], timeout_seconds=61)


def test_task_step_rejects_unknown_action() -> None:
    with pytest.raises(ValidationError):
        TaskStep(action="execute_shell")
