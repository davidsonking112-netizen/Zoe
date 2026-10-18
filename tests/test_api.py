from fastapi.testclient import TestClient

from zoe.api import app


def test_health_does_not_start_browser() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["browser_started"] is False


def test_navigate_rejects_localhost_before_browser_launch() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/v1/browser/navigate",
            json={"url": "http://127.0.0.1:8000/admin"},
        )
        assert response.status_code == 400
        assert "not allowed" in response.json()["detail"].lower()


def test_request_validation_rejects_missing_url() -> None:
    with TestClient(app) as client:
        response = client.post("/v1/browser/navigate", json={})
        assert response.status_code == 422


def test_session_lifecycle_endpoints() -> None:
    with TestClient(app) as client:
        created = client.post("/v1/sessions")
        assert created.status_code == 201
        session_id = created.json()["session_id"]

        listed = client.get("/v1/sessions")
        assert listed.status_code == 200
        assert listed.json()["active_sessions"] == 1
        assert listed.json()["sessions"][0]["session_id"] == session_id

        # Session-specific browser operations fail clearly until a page is opened.
        inspected = client.get(
            "/v1/browser/inspect",
            headers={"X-Zoe-Session-ID": session_id},
        )
        assert inspected.status_code == 409

        closed = client.delete(f"/v1/sessions/{session_id}")
        assert closed.status_code == 200
        assert closed.json()["closed"] is True

        missing = client.get(
            "/v1/browser/inspect",
            headers={"X-Zoe-Session-ID": session_id},
        )
        assert missing.status_code == 404


def test_session_listing_has_no_session_secrets() -> None:
    with TestClient(app) as client:
        created = client.post("/v1/sessions")
        session_id = created.json()["session_id"]
        response = client.get("/v1/sessions")
        assert response.status_code == 200
        serialized = response.text
        assert session_id in serialized
        assert "cookies" not in serialized.lower()
        assert "storage_state" not in serialized.lower()
        client.delete(f"/v1/sessions/{session_id}")
