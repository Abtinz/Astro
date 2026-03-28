import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import time
import uuid
from typing import Optional

from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .graph import run_deep_agent

app = FastAPI(title="Deep Agent API", version="1.0.0")

LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "deep_agent_api.log"

logger = logging.getLogger("deep_agent.api")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=1_000_000, backupCount=3)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    task: str
    constraints: str = ""
    context: str = ""
    max_refinements: Optional[int] = None


@app.middleware("http")
async def request_log_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    start = time.perf_counter()
    logger.info("request_id=%s method=%s path=%s", request_id, request.method, request.url.path)
    try:
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "request_id=%s status=%s elapsed_ms=%s",
            request_id,
            response.status_code,
            elapsed_ms,
        )
        response.headers["x-request-id"] = request_id
        return response
    except Exception as exc:  # noqa: BLE001
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.exception(
            "request_id=%s status=500 elapsed_ms=%s error=%s",
            request_id,
            elapsed_ms,
            str(exc),
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "request_id": request_id},
        )


@app.get("/health")
def health():
    logger.info("health_check=ok")
    return {"ok": True}


@app.options("/run")
def run_preflight():
    # Fallback handler: CORSMiddleware should handle this, but this guarantees 200 for OPTIONS.
    return {"ok": True}


@app.post("/run")
def run(payload: RunRequest):
    logger.info("run_start task_len=%s max_refinements=%s", len(payload.task), payload.max_refinements)
    result = run_deep_agent(
        task=payload.task,
        constraints=payload.constraints,
        context=payload.context,
        max_refinements=payload.max_refinements,
    )
    logger.info(
        "run_done status=%s approved=%s has_error=%s",
        result.get("status"),
        result.get("approved"),
        bool(result.get("error")),
    )
    return result
