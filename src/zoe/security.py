"""Initial URL and network-destination checks for Zoe's browser runtime.

These checks reduce obvious SSRF exposure but are not a substitute for network-level
egress controls. DNS rebinding and platform-specific routing require defense in depth.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit


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
