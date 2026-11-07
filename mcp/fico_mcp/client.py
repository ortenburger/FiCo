"""Thin HTTP client for the FiCo Fastify API."""

from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_API_BASE = "http://127.0.0.1:3001"
DEFAULT_DEMO_USER_ID = "00000000-0000-4000-8000-000000000001"


def api_base() -> str:
    return os.environ.get("FICO_API_BASE", DEFAULT_API_BASE).rstrip("/")


def demo_user_id() -> str:
    return (
        os.environ.get("FICO_DEMO_USER_ID", DEFAULT_DEMO_USER_ID).strip()
        or DEFAULT_DEMO_USER_ID
    )


class FicoApiError(RuntimeError):
    def __init__(self, method: str, path: str, status: int, body: str) -> None:
        super().__init__(f"{method} {path} → HTTP {status}: {body[:500]}")
        self.method = method
        self.path = path
        self.status = status
        self.body = body


async def request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json: Any | None = None,
) -> Any:
    url = f"{api_base()}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(method, url, params=params, json=json)
    if response.status_code >= 400:
        raise FicoApiError(method, path, response.status_code, response.text)
    if response.status_code == 204 or not response.content:
        return {"ok": True}
    return response.json()
