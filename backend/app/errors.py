"""RFC 7807 ``application/problem+json`` error handling."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.retask.decisions import DecisionError

logger = logging.getLogger("airops.errors")

PROBLEM_CONTENT_TYPE = "application/problem+json"


def _problem(
    status: int,
    title: str,
    detail: str,
    *,
    errors: list[dict[str, str]] | None = None,
) -> JSONResponse:
    body: dict[str, object] = {
        "type": "about:blank",
        "title": title,
        "status": status,
        "detail": detail,
    }
    if errors:
        body["errors"] = errors
    return JSONResponse(status_code=status, content=body, media_type=PROBLEM_CONTENT_TYPE)


def register_error_handlers(app: FastAPI) -> None:
    """Install RFC 7807 handlers for HTTP, validation and unhandled errors."""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _problem(exc.status_code, str(exc.detail), str(exc.detail))

    @app.exception_handler(DecisionError)
    async def decision_exception_handler(_: Request, exc: DecisionError) -> JSONResponse:
        body: dict[str, object] = {
            "type": exc.problem_type,
            "title": exc.title,
            "status": exc.status_code,
            "detail": exc.detail,
            **exc.extensions,
        }
        if exc.violations:
            body["violations"] = exc.violations
        return JSONResponse(
            status_code=exc.status_code,
            content=body,
            media_type=PROBLEM_CONTENT_TYPE,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {
                "field": ".".join(str(part) for part in err.get("loc", ())),
                "message": str(err.get("msg", "invalid")),
            }
            for err in exc.errors()
        ]
        return _problem(
            422,
            "Validation Error",
            "Request validation failed.",
            errors=errors,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error: %s", exc)
        return _problem(500, "Internal Server Error", "An unexpected error occurred.")
