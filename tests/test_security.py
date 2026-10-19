from unittest.mock import patch

import pytest

from zoe.security import UnsafeDestinationError, redact_sensitive_url, validate_public_http_url


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "http://localhost/",
        "http://localhost.localdomain/",
        "http://127.0.0.1/",
        "http://10.0.0.1/",
        "http://192.168.1.10/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "https://user:password@example.com/",
        "http://service.internal/",
        "http://printer.local/",
        "",
    ],
)
def test_rejects_unsafe_urls(url: str) -> None:
    with pytest.raises(UnsafeDestinationError):
        validate_public_http_url(url)


def test_rejects_host_resolving_to_private_address() -> None:
    private_result = (None, None, None, None, ("192.168.1.2", 80))
    with patch("zoe.security.socket.getaddrinfo", return_value=[private_result]):
        with pytest.raises(UnsafeDestinationError, match="private"):
            validate_public_http_url("http://example.test")


def test_accepts_public_host_when_dns_is_public() -> None:
    public_result = (None, None, None, None, ("93.184.216.34", 80))
    with patch("zoe.security.socket.getaddrinfo", return_value=[public_result]):
        assert validate_public_http_url("http://example.test/path") == "http://example.test/path"


def test_rejects_unresolvable_hostname() -> None:
    with patch("zoe.security.socket.getaddrinfo", side_effect=OSError("no DNS")):
        with pytest.raises(UnsafeDestinationError, match="could not be resolved"):
            validate_public_http_url("https://does-not-resolve.invalid")



def test_redacts_sensitive_query_parameters_and_fragments() -> None:
    redacted = redact_sensitive_url(
        "https://example.test/account?access_token=secret-value&tab=home#id_token=fragment-secret"
    )
    assert "secret-value" not in redacted
    assert "fragment-secret" not in redacted
    assert "tab=home" in redacted
    assert "[redacted]" in redacted
    assert redact_sensitive_url("https://example.test/#/settings") == "https://example.test/#/settings"
