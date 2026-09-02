"""API error types mapped to HTTP responses in :mod:`ltx_api.errors`."""

from __future__ import annotations


class APIError(Exception):
    """Base class for errors that become HTTP responses."""

    status_code: int = 500

    def __init__(self, detail: str, *, argv: list[str] | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.argv = argv


class CLIValidationError(APIError):
    """The request failed the official CLI parser (argparse ``SystemExit``).

    Carries the exact message a CLI user would have seen.
    """

    status_code = 422


class PathNotAllowedError(APIError):
    status_code = 422


class AuthError(APIError):
    status_code = 401


class ForbiddenError(APIError):
    status_code = 403


class NotFoundError(APIError):
    status_code = 404


class ConflictError(APIError):
    status_code = 409


class PayloadTooLargeError(APIError):
    status_code = 413


class UnavailableError(APIError):
    status_code = 503


class JobExecutionError(APIError):
    """A parsed job failed inside the pipeline or during encoding."""

    status_code = 500
