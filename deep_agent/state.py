from typing import Dict, List, Optional, TypedDict


class AgentState(TypedDict, total=False):
    task: str
    constraints: str
    context: str

    plan_steps: List[str]
    reasoning: str
    draft_answer: str
    critique: str
    final_answer: str

    current_iteration: int
    max_refinements: int
    approved: bool
    status: str
    error: str

    model_used: str
    trace: List[Dict[str, str]]
