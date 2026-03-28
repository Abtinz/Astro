import unittest
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from deep_agent.nodes import route_after_critic


class NodeRoutingTests(unittest.TestCase):
    def test_route_finalize_when_approved(self) -> None:
        state = {"approved": True, "current_iteration": 0, "max_refinements": 2}
        self.assertEqual(route_after_critic(state), "finalize")

    def test_route_refiner_when_not_approved_and_iterations_available(self) -> None:
        state = {"approved": False, "current_iteration": 1, "max_refinements": 3}
        self.assertEqual(route_after_critic(state), "refiner")

    def test_route_finalize_when_iterations_exhausted(self) -> None:
        state = {"approved": False, "current_iteration": 2, "max_refinements": 2}
        self.assertEqual(route_after_critic(state), "finalize")


if __name__ == "__main__":
    unittest.main()
