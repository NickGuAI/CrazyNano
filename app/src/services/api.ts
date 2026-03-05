// Base API client with SSE support

const API_BASE = '/api';

class APIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new APIError(response.status, error.detail || error.message || 'Request failed');
  }

  return response.json();
}

// SSE client for streaming responses
export function streamSSE<T>(
  endpoint: string,
  body: unknown,
  onEvent: (event: T) => void,
  onError?: (error: Error) => void
): AbortController {
  console.log('[streamSSE] called with endpoint:', endpoint);
  console.log('[streamSSE] body:', body);
  const controller = new AbortController();

  const url = `${API_BASE}${endpoint}`;
  console.log('[streamSSE] making fetch POST to:', url);
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      console.log('[streamSSE] fetch response received, status:', response.status, 'ok:', response.ok);
      if (!response.ok) {
        throw new APIError(response.status, 'Stream request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent(data as T);
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    })
    .catch((error) => {
      console.log('[streamSSE] fetch error caught:', error.name, error.message);
      if (error.name !== 'AbortError') {
        onError?.(error);
      }
    });

  return controller;
}

export { request, APIError };
