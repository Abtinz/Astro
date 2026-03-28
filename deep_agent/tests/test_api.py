import unittest
from unittest.mock import patch
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from deep_agent.api import app


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})

    @patch("deep_agent.api.run_deep_agent")
    def test_run_endpoint(self, mock_run_deep_agent) -> None:
        mock_run_deep_agent.return_value = {
            "status": "success",
            "approved": True,
            "final_answer": "done",
            "trace": [{"node": "planner", "model": "gemini-2.5-pro", "note": "ok"}],
        }

        payload = {
            "task": "Build a robust pipeline",
            "constraints": "Use Gemini",
            "context": "High demand resilience required",
            "max_refinements": 3,
        }
        response = self.client.post("/run", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "success")
        self.assertTrue(body["approved"])
        self.assertEqual(body["final_answer"], "done")
        self.assertIn("trace", body)
        mock_run_deep_agent.assert_called_once_with(
            task=payload["task"],
            constraints=payload["constraints"],
            context=payload["context"],
            max_refinements=payload["max_refinements"],
        )


if __name__ == "__main__":
    unittest.main()
