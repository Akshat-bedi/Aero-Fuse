"""FastAPI application factory for the AirOps DSS backend."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.routes import router as ops_router
from app.api.ws import router as ws_router
from app.config import Settings, get_settings
from app.errors import register_error_handlers
from app.logging_setup import configure_logging
from app.middleware import RequestIdMiddleware
from app.runtime import SimRuntime


def create_app(
    *, autostart_sim: bool = True, settings: Settings | None = None
) -> FastAPI:
    """Build the FastAPI application from the current settings.

    ``autostart_sim=False`` (tests) builds the runtime and attaches it to
    ``app.state`` but does not start the wall-clock tick/heartbeat loops, so
    tests fast-forward deterministically via ``runtime.engine.tick()``.
    ``settings`` overrides the cached environment settings (tests use zero
    retask/demo delays).
    """
    resolved = settings or get_settings()
    configure_logging(resolved.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        runtime = SimRuntime(resolved)
        app.state.runtime = runtime
        if autostart_sim:
            runtime.start(asyncio.get_running_loop())
        else:
            runtime.bind(asyncio.get_running_loop())
        try:
            yield
        finally:
            await runtime.stop()

    app = FastAPI(
        title=resolved.app_name, version=resolved.app_version, lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIdMiddleware)

    register_error_handlers(app)
    app.include_router(health_router, prefix="/api")
    app.include_router(ops_router, prefix="/api")
    app.include_router(ws_router)

    return app


app = create_app()
