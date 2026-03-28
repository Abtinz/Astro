from typing import Dict, List

from .gemini_client import GeminiResilientClient
from .state import AgentState


def _append_trace(state: AgentState, node: str, model: str, note: str) -> None:
    trace = state.get("trace", [])
    trace.append({"node": node, "model": model, "note": note})
    state["trace"] = trace


def planner_node(state: AgentState, client: GeminiResilientClient) -> AgentState:
    prompt = f"""
You are a planning agent.
Return strict JSON with this shape:
{{
  "plan_steps": ["step 1", "step 2", "step 3"]
}}

Task:
{state["task"]}

Constraints:
{state.get("constraints", "None")}

Context:
{state.get("context", "None")}
""".strip()

    data, model = client.generate_json(prompt, preferred_model="gemini-2.5-flash")
    state["plan_steps"] = data.get("plan_steps", []) or ["Analyze task", "Implement solution", "Validate output"]
    _append_trace(state, "planner", model, f"generated {len(state['plan_steps'])} steps")
    return state


def reasoner_node(state: AgentState, client: GeminiResilientClient) -> AgentState:
    plan_steps = "\n".join(f"- {s}" for s in state.get("plan_steps", []))
    prompt = f"""
You are a technical reasoner.
Produce concise but deep reasoning for the execution strategy.

Task:
{state["task"]}

Plan:
{plan_steps}

Constraints:
{state.get("constraints", "None")}

Context:
{state.get("context", "None")}
""".strip()

    reasoning, model = client.generate_text(prompt, preferred_model="gemini-2.5-flash")
    state["reasoning"] = reasoning
    _append_trace(state, "reasoner", model, "produced execution reasoning")
    return state


def executor_node(state: AgentState, client: GeminiResilientClient) -> AgentState:
    plan_steps = "\n".join(f"- {s}" for s in state.get("plan_steps", []))
    prompt = f"""
You are an execution agent.
Generate the best possible response for the task using the provided plan and reasoning.
Be concrete and implementation-focused.
Keep the response concise and practical (maximum 350 words).

Task:
{state["task"]}

Plan:
{plan_steps}

Reasoning:
{state.get("reasoning", "")}

Constraints:
{state.get("constraints", "None")}
""".strip()

    draft, model = client.generate_text(prompt, preferred_model="gemini-2.5-flash")
    state["draft_answer"] = draft
    _append_trace(state, "executor", model, "created draft answer")
    return state


def critic_node(state: AgentState, client: GeminiResilientClient) -> AgentState:
    prompt = f"""
You are a strict reviewer.
Evaluate whether the draft fully satisfies the task.
Return strict JSON:
{{
  "approved": true/false,
  "critique": "short actionable feedback",
  "missing_items": ["..."]
}}

Task:
{state["task"]}

Constraints:
{state.get("constraints", "None")}

Draft:
{state.get("draft_answer", "")}
""".strip()

    data, model = client.generate_json(prompt, preferred_model="gemini-2.5-flash")
    approved = bool(data.get("approved", False))
    critique = data.get("critique", "No critique provided.")
    missing_items = data.get("missing_items", [])
    if isinstance(missing_items, list) and missing_items:
        critique = f"{critique}\nMissing: " + ", ".join(str(x) for x in missing_items)

    state["approved"] = approved
    state["critique"] = critique
    _append_trace(state, "critic", model, f"approved={approved}")
    return state


def refiner_node(state: AgentState, client: GeminiResilientClient) -> AgentState:
    prompt = f"""
You are a refinement agent.
Improve the draft using the critique while preserving strengths.

Task:
{state["task"]}

Current draft:
{state.get("draft_answer", "")}

Critique:
{state.get("critique", "")}
""".strip()

    refined, model = client.generate_text(prompt, preferred_model="gemini-2.5-flash")
    state["draft_answer"] = refined
    state["current_iteration"] = state.get("current_iteration", 0) + 1
    _append_trace(state, "refiner", model, f"iteration={state['current_iteration']}")
    return state


def finalize_node(state: AgentState) -> AgentState:
    state["final_answer"] = state.get("draft_answer", "")
    state["status"] = "success" if state.get("final_answer") else "failed"
    return state


def route_after_critic(state: AgentState) -> str:
    if state.get("approved"):
        return "finalize"

    current_iteration = state.get("current_iteration", 0)
    max_refinements = state.get("max_refinements", 2)
    if current_iteration >= max_refinements:
        return "finalize"

    return "refiner"
