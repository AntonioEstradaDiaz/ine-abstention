import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.data import router as data_router
from app.api.v1.health import router as health_router
from app.api.v1.laboratory import router as laboratory_router
from app.api.v1.models import router as models_router
from app.api.v1.predictions import router as predictions_router
from app.api.v1.simulations import router as simulations_router
from app.api.v1.statistics import router as statistics_router
from app.api.v1.territories import router as territories_router
from app.core.config import get_settings
from app.core.database import get_engine
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    yield
    if get_engine.cache_info().currsize:
        get_engine().dispose()
        get_engine.cache_clear()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", debug=settings.debug, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(health_router, prefix="/api/v1")
app.include_router(data_router, prefix="/api/v1")
app.include_router(statistics_router, prefix="/api/v1")
app.include_router(models_router, prefix="/api/v1")
app.include_router(predictions_router, prefix="/api/v1")
app.include_router(simulations_router, prefix="/api/v1")
app.include_router(territories_router, prefix="/api/v1")
app.include_router(laboratory_router, prefix="/api/v1")


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    # Los valores NaN/Infinity rechazados no se pueden volver a emitir como JSON válido.
    errors = [{key: error[key] for key in ("loc", "msg", "type")} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(SQLAlchemyError)
async def database_unavailable(request, exc):
    logging.getLogger(__name__).warning("database_request_failed")
    return JSONResponse(status_code=503, content={"detail": "Database unavailable"})
