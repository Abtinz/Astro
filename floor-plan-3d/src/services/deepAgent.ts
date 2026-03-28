export interface DeepAgentRunPayload {
  task: string;
  constraints?: string;
  context?: string;
  max_refinements?: number;
}

export interface DeepAgentRunResponse {
  status?: string;
  approved?: boolean;
  final_answer?: string;
  error?: string;
}

const BASE_URL = (process.env.DEEP_AGENT_API_URL || 'http://127.0.0.1:8010').replace(/\/$/, '');

export const checkDeepAgentHealth = async (): Promise<boolean> => {
  const response = await fetch(`${BASE_URL}/health`);
  if (!response.ok) return false;
  const data = await response.json();
  return data?.ok === true;
};

export const runDeepAgent = async (payload: DeepAgentRunPayload): Promise<DeepAgentRunResponse> => {
  const response = await fetch(`${BASE_URL}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Deep agent request failed (${response.status}): ${body || 'unknown error'}`);
  }

  return response.json();
};
