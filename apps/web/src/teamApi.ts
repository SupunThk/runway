import { apiFetch, readJson } from './api';
export async function teamRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(`/api${path}`, {
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const result = await readJson<T & { error?: string }>(response);
  if (!response.ok)
    throw new Error(
      result.error ??
        'Workspace operation failed. Refresh before trying again.',
    );
  return result;
}
