"""FastAPI application factory for the AirOps DSS backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.config import get_settings
from app.errors import register_error_handlers
from app.logging_setup import configure_logging
from app.middleware import RequestIdMiddleware


def create_app() -> FastAPI:
    """Build the FastAPI application from the current settings."""
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title=settings.app_name, version=settings.app_version)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIdMiddleware)

    register_error_handlers(app)
    app.include_router(health_router, prefix="/api")

    return app


app = create_app()
