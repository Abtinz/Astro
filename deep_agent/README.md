# Deep Agent (LangGraph + Gemini)

This module adds a multi-agent orchestration system designed for heavy tasks where Gemini may intermittently return `503 UNAVAILABLE`.

## What it does

- Planning agent: breaks task into steps.
- Reasoning agent: builds detailed technical reasoning.
- Executor agent: produces draft output.
- Critic agent: scores and requests refinement.
- Refiner agent: improves draft until accepted or max rounds reached.
- Resilient Gemini client:
  - retry with exponential backoff on temporary failures (`503`, `UNAVAILABLE`, `RESOURCE_EXHAUSTED`)
  - model fallback sequence (default: `gemini-2.5-pro` -> `gemini-2.5-flash`)

## Setup

```bash
cd /Users/abtinzandi/Desktop/Astro/deep_agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` (or export env vars):

```bash
GEMINI_API_KEY=your_key
DEEP_AGENT_MODELS=gemini-2.5-pro,gemini-2.5-flash
DEEP_AGENT_MAX_RETRIES=4
DEEP_AGENT_MAX_REFINEMENTS=2
```

## CLI usage

```bash
python -m deep_agent.cli --task "Design and implement a robust scene generation workflow"
```

With extra context:

```bash
python -m deep_agent.cli \
  --task "Generate natural 3D floor scenes with reliable stairs/doors" \
  --constraints "Preserve existing UI and use Gemini models only" \
  --context "Current system is React frontend with Gemini calls client-side"
```

## Unit tests

```bash
cd /Users/abtinzandi/Desktop/Astro/deep_agent
python -m unittest discover -s tests -p "test_*.py" -v
```

## API usage (optional)

```bash
uvicorn deep_agent.api:app --reload --port 8010
```

POST `/run`:

```json
{
  "task": "Your heavy task",
  "constraints": "optional constraints",
  "context": "optional context",
  "max_refinements": 2
}
```
