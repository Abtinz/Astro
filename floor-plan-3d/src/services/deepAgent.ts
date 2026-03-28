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
  request_id?: string;
}

const BASE_URL = (process.env.DEEP_AGENT_API_URL || 'http://127.0.0.1:8010').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 120_000;

const fetchWithTimeout = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

export const checkDeepAgentHealth = async (): Promise<boolean> => {
  const response = await fetchWithTimeout(`${BASE_URL}/health`);
  if (!response.ok) return false;
  const data = await response.json();
  return data?.ok === true;
};

export const runDeepAgent = async (payload: DeepAgentRunPayload): Promise<DeepAgentRunResponse> => {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(`${BASE_URL}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  const requestId = response.headers.get('x-request-id') || undefined;
  const elapsedMs = Date.now() - startedAt;
  console.info('[deep-agent] run completed', { status: response.status, elapsedMs, requestId });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Deep agent request failed (${response.status})${requestId ? ` [${requestId}]` : ''}: ${body || 'unknown error'}`);
  }

  const data = await response.json();
  return { ...data, request_id: requestId };
};
