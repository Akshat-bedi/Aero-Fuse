"""Structured JSON logging with request-id correlation."""

import logging
from contextvars import ContextVar
from datetime import UTC, datetime

import orjson

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_formatting_configured = False


class JsonFormatter(logging.Formatter):
    """Render log records as single-line JSON (one object per line)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "requestId": request_id_var.get(),
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return orjson.dumps(payload).decode("utf-8")


def configure_logging(level: str = "INFO") -> None:
    """Install the JSON formatter on the root logger (idempotent)."""
    global _formatting_configured

    root = logging.getLogger()
    root.setLevel(level.upper())
    if _formatting_configured:
        return

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.handlers.clear()
    root.addHandler(handler)
    _formatting_configured = True
