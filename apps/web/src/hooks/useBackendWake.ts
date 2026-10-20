import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, readJson } from '../api';

type WakeState = {
  status: 'idle' | 'waking' | 'ready' | 'failed';
  elapsedSeconds: number;
  message?: string;
};
type Attempt = {
  controller: AbortController;
  started: number;
  deadline?: ReturnType<typeof setTimeout>;
  ticker?: ReturnType<typeof setInterval>;
  poll?: ReturnType<typeof setTimeout>;
};

export function useBackendWake(onReady?: () => void | Promise<unknown>) {
  const [state, setState] = useState<WakeState>({
    status: 'idle',
    elapsedSeconds: 0,
  });
  const attempt = useRef<Attempt | null>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);
  const stop = useCallback(() => {
    const current = attempt.current;
    attempt.current = null;
    if (current) {
      current.controller.abort();
      clearTimeout(current.deadline);
      clearTimeout(current.poll);
      clearInterval(current.ticker);
    }
  }, []);
  useEffect(() => stop, [stop]);
  const wake = useCallback(() => {
    if (attempt.current) return;
    const current: Attempt = {
      controller: new AbortController(),
      started: Date.now(),
    };
    attempt.current = current;
    setState({ status: 'waking', elapsedSeconds: 0 });
    const finish = (status: 'ready' | 'failed', message?: string) => {
      if (attempt.current !== current) return;
      const elapsedSeconds = Math.floor((Date.now() - current.started) / 1000);
      stop();
      setState({ status, elapsedSeconds, message });
      if (status === 'ready')
        void Promise.resolve(ready.current?.()).catch(() => {});
    };
    current.ticker = setInterval(() => {
      if (attempt.current === current)
        setState({
          status: 'waking',
          elapsedSeconds: Math.floor((Date.now() - current.started) / 1000),
        });
    }, 1000);
    current.deadline = setTimeout(() => finish('failed'), 90000);
    const poll = async () => {
      try {
        const response = await apiFetch(
          '/api/health',
          { signal: current.controller.signal },
          8000,
        );
        const health = await readJson<{
          status?: string;
          database?: string;
        } | null>(response);
        if (attempt.current !== current) return;
        if (response.ok && health?.status === 'ready') {
          finish('ready');
          return;
        }
        if (response.status === 503) {
          finish('failed', 'Backend is awake but its database is unavailable.');
          return;
        }
      } catch {
        if (attempt.current !== current) return;
      }
      if (attempt.current === current)
        current.poll = setTimeout(() => void poll(), 3000);
    };
    void poll();
  }, [stop]);
  const retry = useCallback(() => {
    stop();
    wake();
  }, [stop, wake]);
  const reset = useCallback(() => {
    stop();
    setState({ status: 'idle', elapsedSeconds: 0 });
  }, [stop]);
  const fail = useCallback(() => {
    stop();
    setState({ status: 'failed', elapsedSeconds: 0 });
  }, [stop]);
  return { ...state, wake, retry, reset, fail };
}
