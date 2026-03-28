from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

from .graph import run_deep_agent

app = FastAPI(title="Deep Agent API", version="1.0.0")


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
