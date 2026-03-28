import os
from dataclasses import dataclass
from typing import List

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class DeepAgentConfig:
    api_key: str
    models: List[str]
    max_retries: int
    max_refinements: int
    retry_backoff_seconds: float


def load_config() -> DeepAgentConfig:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is required.")

    raw_models = os.getenv("DEEP_AGENT_MODELS", "gemini-2.5-pro,gemini-2.5-flash")
    models = [m.strip() for m in raw_models.split(",") if m.strip()]
    if not models:
        raise ValueError("DEEP_AGENT_MODELS cannot be empty.")

    max_retries = int(os.getenv("DEEP_AGENT_MAX_RETRIES", "4"))
    max_refinements = int(os.getenv("DEEP_AGENT_MAX_REFINEMENTS", "2"))
    retry_backoff_seconds = float(os.getenv("DEEP_AGENT_RETRY_BACKOFF", "1.5"))

    return DeepAgentConfig(
        api_key=api_key,
        models=models,
        max_retries=max_retries,
        max_refinements=max_refinements,
        retry_backoff_seconds=retry_backoff_seconds,
    )
