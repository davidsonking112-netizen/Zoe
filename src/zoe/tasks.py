"""Bounded, sequential browser task execution for Zoe."""
from __future__ import annotations

import asyncio
import time
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from zoe.browser import ZoeBrowser


class TaskStep(BaseModel):
    """One explicit browser operation; website content is never treated as instructions."""

    action: str = Field(min_length=1, max_length=32)
    operation: Literal["click", "fill"] = "click"
    url: str | None = Field(default=None, max_length=2048)
    selector: str | None = Field(default=None, max_length=1000)
    text: str | None = Field(default=None, max_length=20_000)
    strategy: str | None = Field(default=None, max_length=32)
    value: str | None = Field(default=None, max_length=500)
    role: str | None = Field(default=None, max_length=100)
    exact: bool = True
    expected: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_required_fields(self) -> "TaskStep":
        required = {
            "navigate": ("url",),
            "click": ("selector",),
            "fill": ("selector", "text"),
            "semantic_action": ("strategy", "value"),
            "verify_text": ("expected",),
            "verify_url": ("expected",),
        }
        if self.action not in {"navigate", "inspect", "click", "fill", "semantic_action",
                               "verify_text", "verify_url"}:
            raise ValueError("Unsupported task action.")
        for field_name in required.get(self.action, ()):
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} is required for action '{self.action}'.")
        if self.action == "semantic_action" and self.strategy not in {
            "role", "label", "text", "placeholder", "test_id"
        }:
            raise ValueError("Unsupported semantic locator strategy.")
        if self.action == "semantic_action" and self.strategy == "role" and not self.role:
            raise ValueError("role is required for semantic role actions.")
        if self.action == "semantic_action" and self.operation == "fill":
            if self.strategy not in {"label", "placeholder", "test_id"}:
                raise ValueError("semantic fill supports label, placeholder, or test_id strategies.")
            if self.text is None:
                raise ValueError("text is required when a semantic action fills a field.")
        return self


class TaskRequest(BaseModel):
    steps: list[TaskStep] = Field(min_length=1, max_length=20)
    timeout_seconds: int = Field(default=45, ge=1, le=60)
    stop_on_error: bool = True


class TaskStepResult(BaseModel):
    index: int
    action: str
    success: bool
    duration_ms: int
    result: dict[str, Any] | None = None
    error: str | None = None


class TaskResult(BaseModel):
    success: bool
    completed_steps: int
    total_steps: int
    duration_ms: int
    stopped_at_step: int | None = None
    steps: list[TaskStepResult]


async def run_task(browser: ZoeBrowser, request: TaskRequest) -> TaskResult:
    """Execute a bounded sequence and stop on failure by default."""
    started = time.monotonic()
    results: list[TaskStepResult] = []

    async def execute() -> None:
        for index, step in enumerate(request.steps, start=1):
            step_started = time.monotonic()
            try:
                result: dict[str, Any] | None
                if step.action == "navigate":
                    result = await browser.navigate(step.url or "")
                    if not result.get("success", False):
                        raise RuntimeError("Navigation returned a non-success HTTP status.")
                elif step.action == "inspect":
                    result = await browser.inspect()
                elif step.action == "click":
                    result = await browser.click(step.selector or "")
                elif step.action == "fill":
                    result = await browser.fill(step.selector or "", step.text or "")
                elif step.action == "semantic_action":
                    result = await browser.semantic_action(
                        action=step.operation,
                        strategy=step.strategy or "",
                        value=step.value or "",
                        role=step.role,
                        text=step.text,
                        exact=step.exact,
                    )
                elif step.action == "verify_text":
                    observation = await browser.inspect()
                    found = (step.expected or "") in observation["text"]
                    result = {"verified": found, "check": "text_contains"}
                    if not found:
                        raise AssertionError("Expected text was not present in the page.")
                elif step.action == "verify_url":
                    page_url = (await browser.inspect())["url"]
                    found = (step.expected or "") in page_url
                    result = {"verified": found, "check": "url_contains", "url": page_url}
                    if not found:
                        raise AssertionError("Expected URL fragment was not present.")
                else:  # Pydantic validation should make this unreachable.
                    raise ValueError("Unsupported task action.")

                results.append(TaskStepResult(
                    index=index, action=step.action, success=True,
                    duration_ms=int((time.monotonic() - step_started) * 1000),
                    result=result,
                ))
            except Exception as exc:
                results.append(TaskStepResult(
                    index=index, action=step.action, success=False,
                    duration_ms=int((time.monotonic() - step_started) * 1000),
                    error=_safe_error(exc),
                ))
                if request.stop_on_error:
                    break

    try:
        await asyncio.wait_for(execute(), timeout=request.timeout_seconds)
    except TimeoutError:
        results.append(TaskStepResult(
            index=len(results) + 1,
            action="task_timeout",
            success=False,
            duration_ms=0,
            error=f"Task exceeded its {request.timeout_seconds}-second time limit.",
        ))

    failed = next((item for item in results if not item.success), None)
    return TaskResult(
        success=failed is None and len(results) == len(request.steps),
        completed_steps=sum(item.success for item in results),
        total_steps=len(request.steps),
        duration_ms=int((time.monotonic() - started) * 1000),
        stopped_at_step=failed.index if failed else None,
        steps=results,
    )


def _safe_error(exc: Exception) -> str:
    """Return concise error categories without dumping page contents or internals."""
    if isinstance(exc, AssertionError):
        return str(exc)
    if isinstance(exc, TimeoutError):
        return "Browser operation timed out."
    if type(exc).__name__ == "UnsafeDestinationError":
        return "Destination blocked by Zoe URL policy."
    if isinstance(exc, LookupError):
        return "The requested element or resource was not found."
    if isinstance(exc, ValueError):
        return str(exc)
    return f"Browser step failed ({type(exc).__name__})."
