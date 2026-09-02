"""Server configuration for the LTX API.

Every field is settable via an environment variable prefixed with ``LTX_API_``
(e.g. ``LTX_API_OUTPUT_DIR``) or a YAML file referenced by ``LTX_API_CONFIG_FILE``.

Security model: if any API keys exist (a bootstrap admin key via
``LTX_API_ADMIN_KEY``, ``initial_api_keys``, or keys already persisted in the
database) every endpoint except ``GET /health`` requires authentication. With no
keys at all the API is open — suitable only for a trusted network.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from pathlib import Path
from typing import Any

import yaml
from pydantic import Field, PrivateAttr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_ROOTS = ("uploads", "outputs")


def hash_api_key(key: str) -> str:
    """Stable SHA-256 digest used to store API keys at rest (never the raw key)."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    """Generate a new opaque API key. The raw value is shown to the caller exactly once."""
    return "ltx_" + secrets.token_urlsafe(32)


class PipelineDefaults(BaseSettings):
    """Operator-pinned default model paths, merged under each request.

    A value set here is used when the request omits the corresponding CLI flag,
    letting end users submit only a prompt while admins control the models.
    """

    model_config = SettingsConfigDict(env_prefix="LTX_API_")

    checkpoint_path: str | None = None
    distilled_checkpoint_path: str | None = None
    gemma_root: str | None = None
    transformer_path: str | None = None
    text_encoder_path: str | None = None
    video_vae_path: str | None = None
    audio_vae_path: str | None = None
    duration_head_path: str | None = None
    distilled_lora_path: str | None = None
    distilled_lora_strength: float | None = None
    spatial_upsampler_path: str | None = None
    quantization: str | None = None
    offload: str | None = None
    diffvae_optimization: str | None = None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LTX_API_", extra="ignore")

    # Digest of the bootstrap admin key, set at startup (the raw key is never kept).
    _admin_key_hash: str | None = PrivateAttr(default=None)

    host: str = "0.0.0.0"  # noqa: S104 - intentional default; binding is the deployer's choice
    port: int = 8000

    output_dir: Path = Path("outputs")
    upload_dir: Path = Path("uploads")
    db_path: Path = Path("ltx_api.db")

    # Empty = path allowlist disabled (any server path may be referenced).
    # Otherwise every model/conditioning path must live under one of these roots.
    allowed_roots: list[str] = Field(default_factory=list)

    # Bootstrap admin key. Set via LTX_API_ADMIN_KEY. Never logged or returned by the API.
    admin_key: str | None = None
    # Optional declarative key seeding: {"keys": [{"key": "...", "role": "admin"}]}
    initial_api_keys: dict[str, Any] | None = None

    # Job queue
    max_queue_size: int = 100
    max_queued_per_key: int = 10
    max_upload_mb: int = 50
    output_ttl_hours: float = 24.0
    job_ttl_days: float = 7.0
    cleanup_interval_seconds: int = 900

    # Pipeline cache: -1 = unbounded, 0 = no caching, N = keep N warm pipelines
    max_cached_pipelines: int = 1

    cors_origins: list[str] = Field(default_factory=list)
    log_level: str = "INFO"

    default_distilled: PipelineDefaults = Field(default_factory=PipelineDefaults)
    default_ti2vid: PipelineDefaults = Field(default_factory=PipelineDefaults)

    @model_validator(mode="after")
    def _check_non_negative(self) -> Settings:
        if self.max_cached_pipelines < -1:
            raise ValueError("max_cached_pipelines must be -1 (unbounded), 0 (no cache) or a positive integer")
        return self

    def ensured_dirs(self) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def effective_allowed_roots(self) -> list[Path]:
        """Resolved allowlist. Data dirs are always allowed; empty list disables checks."""
        if not self.allowed_roots:
            return []
        resolved: list[Path] = []
        for entry in (*self.allowed_roots, *DEFAULT_ROOTS):
            p = Path(entry)
            if not p.is_absolute():
                p = Path.cwd() / p
            resolved.append(p.resolve())
        return resolved

    def validate_path(self, value: str, *, what: str) -> str:
        """Resolve *value* and enforce the configured root allowlist.

        Returns the resolved absolute path string. Raises ``ValueError`` when the
        path escapes every allowed root (allowlist enabled only).
        """
        candidate = Path(value).expanduser()
        if not candidate.is_absolute():
            candidate = Path.cwd() / candidate
        resolved = candidate.resolve()
        roots = self.effective_allowed_roots()
        if not roots:
            return str(resolved)
        for root in roots:
            if resolved.is_relative_to(root):
                return str(resolved)
        raise ValueError(f"{what} '{value}' is outside the allowed roots: {', '.join(str(r) for r in roots)}")


def load_settings() -> Settings:
    """Build settings from env vars, optionally layered over a YAML config file.

    Precedence (highest wins): environment variables > YAML file > defaults.
    """
    import os

    data: dict[str, Any] = {}
    config_file = os.environ.get("LTX_API_CONFIG_FILE")
    if config_file:
        raw = yaml.safe_load(Path(config_file).read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"Config file {config_file} must contain a YAML mapping at the top level")
        data.update(raw)
    nested = os.environ.get("LTX_API_INITIAL_API_KEYS")
    if nested:
        data["initial_api_keys"] = json.loads(nested)
    return Settings(**data)
