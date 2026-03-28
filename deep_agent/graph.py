from typing import Optional

from langgraph.graph import END, START, StateGraph

from .config import DeepAgentConfig, load_config
from .gemini_client import GeminiResilientClient
from .nodes import (
    critic_node,
    executor_node,
    finalize_node,
    planner_node,
    reasoner_node,
    refiner_node,
    route_after_critic,
)
from .state import AgentState


def build_graph(client: GeminiResilientClient):
    graph = StateGraph(AgentState)

    graph.add_node("planner", lambda s: planner_node(s, client))
    graph.add_node("reasoner", lambda s: reasoner_node(s, client))
    graph.add_node("executor", lambda s: executor_node(s, client))
    graph.add_node("critic", lambda s: critic_node(s, client))
    graph.add_node("refiner", lambda s: refiner_node(s, client))
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "planner")
    graph.add_edge("planner", "reasoner")
    graph.add_edge("reasoner", "executor")
    graph.add_edge("executor", "critic")
    graph.add_conditional_edges(
        "critic",
        route_after_critic,
        {"refiner": "refiner", "finalize": "finalize"},
    )
    graph.add_edge("refiner", "critic")
    graph.add_edge("finalize", END)

    return graph.compile()


def run_deep_agent(
    task: str,
    constraints: str = "",
    context: str = "",
    max_refinements: Optional[int] = None,
    config: Optional[DeepAgentConfig] = None,
) -> AgentState:
    cfg = config or load_config()
    client = GeminiResilientClient(cfg)
    app = build_graph(client)

    state: AgentState = {
        "task": task,
        "constraints": constraints,
        "context": context,
        "current_iteration": 0,
        "max_refinements": max_refinements if max_refinements is not None else cfg.max_refinements,
        "approved": False,
        "status": "running",
        "trace": [],
    }

    try:
        result = app.invoke(state)
        return result
    except Exception as exc:  # noqa: BLE001
        return {
            **state,
            "status": "failed",
            "error": str(exc),
            "final_answer": state.get("draft_answer", ""),
        }
