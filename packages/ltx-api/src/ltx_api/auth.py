"""API-key authentication and role guards.

Keys arrive in the ``X-API-Key`` header and are looked up by SHA-256 digest.
Security model: if *any* key exists (bootstrap admin key, seeded keys, or keys in
the database) every endpoint except ``GET /health`` requires authentication; with
no keys at all the API is open (trusted-network deployments only).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header

from ltx_api.config import hash_api_key
from ltx_api.errors import AuthError, ForbiddenError
from ltx_api.schemas import Role


def _authenticate(request, x_api_key: str | None) -> tuple[str | None, Role | None, str | None]:
    """Return ``(key_hash, role, label)`` — or ``(None, None, None)`` when auth is disabled."""
    store: JobStore = request.app.state.store
    settings: Settings = request.app.state.settings

    bootstrap_admin_hash: str | None = getattr(settings, "_admin_key_hash", None)

    if x_api_key is None:
        # Open mode only when no keys of any kind exist.
        if bootstrap_admin_hash or store.list_api_keys():
            raise AuthError("Missing X-API-Key header")
        return None, None, None

    key_hash = hash_api_key(x_api_key)
    if bootstrap_admin_hash and key_hash == bootstrap_admin_hash:
        return key_hash, Role.admin, "bootstrap-admin"

    record = store.get_api_key(key_hash)
    if record is None:
        raise AuthError("Invalid or revoked API key")
    store.touch_api_key(key_hash)
    return key_hash, Role(record["role"]), record["label"]


def get_principal(
    request,
    x_api_key: Annotated[str | None, Header()] = None,
) -> Annotated[tuple[str | None, Role | None, str | None], None]:
    return _authenticate(request, x_api_key)


Principal = Annotated[tuple[str | None, Role | None, str | None], Depends(get_principal)]


def require_admin(principal: Principal) -> tuple[str | None, Role | None, str | None]:
    key_hash, role, label = principal
    if role is not Role.admin:
        raise ForbiddenError("This endpoint requires an admin API key")
    return key_hash, role, label


AdminPrincipal = Annotated[tuple[str | None, Role | None, str | None], Depends(require_admin)]


def authorize_project(project: dict, principal: Principal) -> None:
    """Same visibility rules as jobs: admins see everything, users only their own."""
    key_hash, role, _ = principal
    if role is Role.admin:
        return
    if key_hash is None and role is None:
        return  # open mode (no keys configured)
    if project.get("owner_key_hash") != key_hash:
        raise ForbiddenError("You do not own this project")
