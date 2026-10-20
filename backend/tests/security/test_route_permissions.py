"""Every registered operational route must declare its permission mapping."""

from __future__ import annotations

from app.api.health import router as health_router
from app.api.routes import (
    ACTION_LEVEL,
    PUBLIC_ROUTES,
    ROUTE_PERMISSIONS,
)
from app.api.routes import (
    router as ops_router,
)
from app.security.policy import Permission
from fastapi import FastAPI

_HTTP_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})


def _registered_routes() -> set[tuple[str, str]]:
    app = FastAPI()
    app.include_router(health_router, prefix="/api")
    app.include_router(ops_router, prefix="/api")
    routes: set[tuple[str, str]] = set()
    for path, operations in app.openapi()["paths"].items():
        for method in operations:
            upper = method.upper()
            if upper in _HTTP_METHODS:
                routes.add((upper, path))
    return routes


def test_every_operational_route_has_a_permission_mapping() -> None:
    registered = _registered_routes()
    mapped = set(ROUTE_PERMISSIONS) | PUBLIC_ROUTES
    assert registered - mapped == set(), "unmapped operational routes"
    assert mapped - registered == set(), "stale permission mappings"


def test_mapping_values_are_permissions_or_action_level() -> None:
    for permission in ROUTE_PERMISSIONS.values():
        assert permission is ACTION_LEVEL or isinstance(permission, Permission)


def test_health_is_the_only_public_operational_route() -> None:
    assert {("GET", "/api/health")} == PUBLIC_ROUTES
