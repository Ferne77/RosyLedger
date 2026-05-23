"""
RosyLedger FastAPI application.

Serves ``GET /`` as ``public/index.html``, mounts ``/css`` and ``/js`` for assets,
and registers REST routers under ``/api``. Static files are not mounted at ``/``
so API routes are never shadowed.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import ping_db
from app.db_indexes import ensure_indexes
from app.routers import (
    assistant,
    auth,
    budget,
    categories,
    companion,
    data_export,
    events,
    expenses,
    stats,
    templates,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not settings.has_valid_mongodb_uri():
        print(
            "MONGODB_URI is missing or invalid. Add a valid MongoDB Atlas "
            "connection string in app/config.py."
        )
    else:
        try:
            await ping_db()
            await ensure_indexes()
        except Exception as err:
            print(f"Startup DB check failed: {err}")
    yield


app = FastAPI(lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        return JSONResponse(content=exc.detail, status_code=exc.status_code)
    return JSONResponse(
        content={"error": str(exc.detail)}, status_code=exc.status_code
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, exc: RequestValidationError):
    details = jsonable_encoder(exc.errors())
    first_message = details[0].get("msg") if details else "Invalid body"
    return JSONResponse(
        status_code=400,
        content={"error": first_message or "Invalid body", "details": details},
    )


@app.get("/api/health")
async def health():
    try:
        await ping_db()
        return {"ok": True}
    except Exception:
        return JSONResponse(content={"ok": False}, status_code=500)


app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(expenses.router)
app.include_router(stats.router)
app.include_router(budget.router)
app.include_router(assistant.router)
app.include_router(companion.router)
app.include_router(data_export.router)
app.include_router(templates.router)
app.include_router(events.router)

_public = Path(__file__).resolve().parent.parent / "public"


@app.get("/")
async def read_index():
    return FileResponse(_public / "index.html")


app.mount("/css", StaticFiles(directory=str(_public / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(_public / "js")), name="js")
app.mount("/images", StaticFiles(directory=str(_public / "images")), name="images")


@app.get("/sw.js")
async def service_worker():
    return FileResponse(_public / "sw.js", media_type="application/javascript")


@app.get("/manifest.json")
async def manifest():
    return FileResponse(_public / "manifest.json")
