import type { useBackendWake } from './hooks/useBackendWake';

export function BackendWakeNotice({
  wake,
}: {
  wake: ReturnType<typeof useBackendWake>;
}) {
  if (wake.status === 'waking')
    return (
      <div className="callout" role="status" aria-live="polite">
        Waking the Runway backend… Free hosting pauses after inactivity; this
        usually takes 30–60 seconds. ({wake.elapsedSeconds}s)
        <span className="skeleton-line" aria-hidden="true" />
      </div>
    );
  if (wake.status === 'failed')
    return (
      <div className="callout warning" role="alert">
        <p>The backend is still unavailable.</p>
        {wake.message && <p>{wake.message}</p>}
        <button className="text-button" onClick={wake.retry}>
          Retry connection
        </button>
      </div>
    );
  return null;
}
