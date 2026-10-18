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
