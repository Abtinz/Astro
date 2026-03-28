from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .graph import run_deep_agent

app = FastAPI(title="Deep Agent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    task: str
    constraints: str = ""
    context: str = ""
    max_refinements: Optional[int] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/run")
def run(payload: RunRequest):
    result = run_deep_agent(
        task=payload.task,
        constraints=payload.constraints,
        context=payload.context,
        max_refinements=payload.max_refinements,
    )
    return result
