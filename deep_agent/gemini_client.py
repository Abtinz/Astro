import json
import time
from typing import Any, Dict, List, Optional, Tuple

from google import genai

from .config import DeepAgentConfig


RETRYABLE_MARKERS = ("503", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "temporarily", "high demand")


class GeminiResilientClient:
    def __init__(self, config: DeepAgentConfig) -> None:
        self.config = config
        self.client = genai.Client(api_key=config.api_key)

    def generate_text(self, prompt: str, preferred_model: Optional[str] = None) -> Tuple[str, str]:
        model_sequence = self._build_model_sequence(preferred_model)
        last_error = None

        for model in model_sequence:
            for attempt in range(1, self.config.max_retries + 1):
                try:
                    response = self.client.models.generate_content(model=model, contents=prompt)
                    text = self._extract_text(response)
                    if not text:
                        raise RuntimeError(f"Empty response from model {model}")
                    return text, model
                except Exception as exc:  # noqa: BLE001
                    last_error = exc
                    if not self._is_retryable(exc):
                        break
                    sleep_s = self.config.retry_backoff_seconds * (2 ** (attempt - 1))
                    time.sleep(sleep_s)

        raise RuntimeError(f"All model attempts failed. Last error: {last_error}")

    def generate_json(self, prompt: str, preferred_model: Optional[str] = None) -> Tuple[Dict[str, Any], str]:
        raw_text, used_model = self.generate_text(prompt, preferred_model=preferred_model)
        data = self._safe_json_parse(raw_text)
        if data is None:
            fallback_prompt = (
                "Return valid JSON only. No markdown, no commentary.\n\n"
                f"Original request:\n{prompt}\n\n"
                f"Previous output:\n{raw_text}"
            )
            retry_text, used_model = self.generate_text(fallback_prompt, preferred_model=used_model)
            data = self._safe_json_parse(retry_text)
            if data is None:
                raise RuntimeError("Failed to parse JSON response from Gemini.")
        return data, used_model

    def _build_model_sequence(self, preferred_model: Optional[str]) -> List[str]:
        models = list(self.config.models)
        if preferred_model and preferred_model in models:
            models.remove(preferred_model)
            models.insert(0, preferred_model)
        elif preferred_model:
            models.insert(0, preferred_model)
        return models

    @staticmethod
    def _extract_text(response: Any) -> str:
        text = getattr(response, "text", None)
        if text:
            return text.strip()

        candidates = getattr(response, "candidates", None) or []
        chunks: List[str] = []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) if content else None
            if not parts:
                continue
            for part in parts:
                value = getattr(part, "text", None)
                if value:
                    chunks.append(value)
        return "\n".join(chunks).strip()

    @staticmethod
    def _safe_json_parse(text: str) -> Optional[Dict[str, Any]]:
        stripped = text.strip()
        if not stripped:
            return None
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

        if "```" in stripped:
            start = stripped.find("{")
            end = stripped.rfind("}")
            if start != -1 and end != -1 and end > start:
                snippet = stripped[start : end + 1]
                try:
                    return json.loads(snippet)
                except json.JSONDecodeError:
                    return None
        return None

    @staticmethod
    def _is_retryable(exc: Exception) -> bool:
        msg = str(exc)
        return any(marker.lower() in msg.lower() for marker in RETRYABLE_MARKERS)
