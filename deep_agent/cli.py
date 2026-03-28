import argparse
import json

from .graph import run_deep_agent


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run Deep Agent (LangGraph + Gemini).")
    parser.add_argument("--task", required=True, help="Primary task to solve.")
    parser.add_argument("--constraints", default="", help="Optional constraints.")
    parser.add_argument("--context", default="", help="Optional context.")
    parser.add_argument(
        "--max-refinements",
        type=int,
        default=None,
        help="Override max refinement rounds.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print full output state as JSON.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    result = run_deep_agent(
        task=args.task,
        constraints=args.constraints,
        context=args.context,
        max_refinements=args.max_refinements,
    )

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    print("Status:", result.get("status", "unknown"))
    print("Approved:", result.get("approved", False))
    print("\nFinal Answer:\n")
    print(result.get("final_answer", ""))

    trace = result.get("trace", [])
    if trace:
        print("\nTrace:")
        for item in trace:
            print(f"- {item.get('node')} ({item.get('model')}): {item.get('note')}")

    if result.get("error"):
        print("\nError:")
        print(result["error"])


if __name__ == "__main__":
    main()
