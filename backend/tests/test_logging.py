"""Request URLs never leak query strings (and therefore tokens) into logs."""

from __future__ import annotations

from app.logging_setup import redact_query_strings


def test_redacts_query_string_from_path() -> None:
    assert (
        redact_query_strings("GET /api/audit?token=secret&action=X HTTP/1.1")
        == "GET /api/audit HTTP/1.1"
    )


def test_redacts_query_string_from_absolute_url() -> None:
    assert (
        redact_query_strings("HTTP Request: GET http://testserver/api/ws?token=secret")
        == "HTTP Request: GET http://testserver/api/ws"
    )


def test_leaves_messages_without_urls_unchanged() -> None:
    message = "retasking EV-0001 -> REC-0001 (score 90.2, no_feasible=False)"
    assert redact_query_strings(message) == message
