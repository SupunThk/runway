export class BackendUnavailableError extends Error {
  constructor(public reason: 'timeout' | 'network' | 'gateway' | 'non-json') {
    super('BACKEND_WAKING');
    this.name = 'BackendUnavailableError';
  }
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, timeout.signal])
        : timeout.signal,
    });
    if (
      [502, 503, 504].includes(response.status) &&
      !/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(
        response.headers.get('content-type') ?? '',
      )
    )
      throw new BackendUnavailableError('gateway');
    return response;
  } catch (error) {
    // Stopping a request or leaving a route is not evidence of a cold backend.
    if (init.signal?.aborted) throw init.signal.reason ?? error;
    if (timeout.signal.aborted) throw new BackendUnavailableError('timeout');
    if (error instanceof TypeError)
      throw new BackendUnavailableError('network');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new BackendUnavailableError('non-json');
  }
}
