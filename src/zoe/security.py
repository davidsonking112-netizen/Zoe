"""Initial URL and network-destination checks for Zoe's browser runtime.

These checks reduce obvious SSRF exposure but are not a substitute for network-level
egress controls. DNS rebinding and platform-specific routing require defense in depth.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit



def _decode_url_component(value: str) -> str:
    """Decode ASCII percent-escapes in a URL component for sensitive-key matching."""
    decoded: list[str] = []
    index = 0
    while index < len(value):
        if value[index] == "+":
            decoded.append(" ")
            index += 1
        elif (
            value[index] == "%"
            and index + 2 < len(value)
            and all(char in "0123456789abcdefABCDEF" for char in value[index + 1:index + 3])
        ):
            decoded.append(chr(int(value[index + 1:index + 3], 16)))
            index += 3
        else:
            decoded.append(value[index])
            index += 1
    return "".join(decoded)


def redact_sensitive_url(url: str) -> str:
    """Redact credential-like query parameters and fragments before exposing URLs to agents."""
    try:
        parsed = urlsplit(url)
        sensitive_parts = (
            "token", "secret", "password", "passwd", "auth", "session", "credential",
            "api_key", "api-key", "apikey", "signature", "jwt", "code", "otp", "email",
            "phone", "ssn", "card", "cvv", "verification", "one_time_code",
            "one-time-code", "onetimecode",
        )
        query_parts: list[str] = []
        for part in parsed.query.split("&"):
            if not part:
                continue
            key, separator, value = part.partition("=")
            normalized_key = _decode_url_component(key).lower()
            sensitive = normalized_key in {"code", "otp"} or any(
                marker in normalized_key for marker in sensitive_parts
            )
            if sensitive and separator:
                value = "%5Bredacted%5D"
            query_parts.append(key + (separator + value if separator else ""))
        query = "&".join(query_parts)
        normalized_fragment = _decode_url_component(parsed.fragment).lower()
        sensitive_fragment = any(
            marker in normalized_fragment
            for marker in ("token", "auth", "session", "secret", "password", "jwt", "code=")
        )
        fragment = "[redacted]" if sensitive_fragment else parsed.fragment
        result = parsed.scheme + "://" + parsed.netloc + parsed.path
        if query:
            result += "?" + query
        if fragment:
            result += "#" + fragment
        return result
    except (TypeError, ValueError):
        return str(url or "")


class UnsafeDestinationError(ValueError):
    """Raised when a URL does not point to an allowed public web destination."""


def validate_public_http_url(url: str) -> str:
    """Validate a URL and return its normalized form.

    Only public HTTP(S) destinations are accepted. Hostnames are resolved before use,
    and every returned address must be globally routable.
    """
    if not url or len(url) > 2048:
        raise UnsafeDestinationError("URL must contain 1–2048 characters.")

    try:
        parsed = urlsplit(url.strip())
        scheme = parsed.scheme.lower()
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError as exc:
        raise UnsafeDestinationError("Malformed URL.") from exc

    if scheme not in {"http", "https"}:
        raise UnsafeDestinationError("Only http:// and https:// URLs are allowed.")
    if not hostname:
        raise UnsafeDestinationError("URL must include a hostname.")
    if parsed.username is not None or parsed.password is not None:
        raise UnsafeDestinationError("URLs containing embedded credentials are not allowed.")

    hostname = hostname.rstrip(".").lower()
    if hostname in {"localhost", "localhost.localdomain", "metadata.google.internal"}:
        raise UnsafeDestinationError("Local and metadata hostnames are not allowed.")
    if hostname.endswith((".localhost", ".local", ".internal")):
        raise UnsafeDestinationError("Local and internal hostnames are not allowed.")

    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        literal_ip = None

    if literal_ip is not None:
        if not literal_ip.is_global:
            raise UnsafeDestinationError("Private, local, and reserved IP addresses are not allowed.")
        return url.strip()

    try:
        results = socket.getaddrinfo(
            hostname,
            parsed.port or (443 if scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except OSError as exc:
        raise UnsafeDestinationError("Hostname could not be resolved safely.") from exc

    addresses = {result[4][0].split("%", maxsplit=1)[0] for result in results}
    if not addresses:
        raise UnsafeDestinationError("Hostname did not resolve to an address.")
    if not all(ipaddress.ip_address(address).is_global for address in addresses):
        raise UnsafeDestinationError(
            "The hostname resolves to a private, local, or reserved IP address."
        )

    return url.strip()
