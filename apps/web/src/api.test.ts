import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, readJson, BackendUnavailableError } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('backend availability requests', () => {
  it('preserves JSON API failures for the caller', async () => {
    const response = new Response(JSON.stringify({ error: 'Not signed in' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    expect(await apiFetch('/api/auth/session')).toBe(response);
  });
  it('classifies HTML gateway errors and network failures', async () => {
    for (const status of [502, 503, 504]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('<html/>', {
            status,
            headers: { 'content-type': 'text/html' },
          }),
        ),
      );
      await expect(apiFetch('/api/health')).rejects.toMatchObject({
        reason: 'gateway',
      });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(apiFetch('/api/health')).rejects.toMatchObject({
      reason: 'network',
    });
  });
  it('leaves a JSON database 503 available to the wake state machine', async () => {
    const response = new Response('{}', {
      status: 503,
      headers: { 'content-type': 'application/problem+json' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    expect(await apiFetch('/api/health')).toBe(response);
  });
  it('bounds a hung fetch with a classified timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () =>
              reject(init.signal.reason),
            ),
          ),
      ),
    );
    const pending = apiFetch('/api/health', {}, 100);
    const assertion = expect(pending).rejects.toMatchObject({
      reason: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
  it('preserves caller cancellation instead of announcing a cold start', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () =>
              reject(init.signal.reason),
            ),
          ),
      ),
    );
    const caller = new AbortController();
    const pending = apiFetch('/api/health', { signal: caller.signal });
    const reason = new DOMException('User stopped', 'AbortError');
    caller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });
  it('classifies invalid JSON without swallowing a caller abort', async () => {
    await expect(readJson(new Response('not json'))).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    const abort = new DOMException('Stopped', 'AbortError');
    await expect(
      readJson({ json: () => Promise.reject(abort) } as unknown as Response),
    ).rejects.toBe(abort);
  });
});
