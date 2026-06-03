from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.handlers import register_exception_handlers
from app.core.lifespan import lifespan
from app.core.middleware import AccessLogMiddleware, RequestIDMiddleware


def create_app() -> FastAPI:
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="GradeAI — AI-assisted grading platform API",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    application.state.settings = settings

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[settings.request_id_header],
    )
    application.add_middleware(AccessLogMiddleware)
    application.add_middleware(RequestIDMiddleware, settings=settings)

    register_exception_handlers(application)

    application.include_router(api_router, prefix=settings.api_v1_prefix)

    return application


app = create_app()
