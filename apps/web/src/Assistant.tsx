import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Sidebar } from './Sidebar';
import { apiFetch, readJson, BackendUnavailableError } from './api';
import { useBackendWake } from './hooks/useBackendWake';
import { BackendWakeNotice } from './BackendWakeNotice';
import { LiveAccountCard } from './components/LiveAccountCard';

type Source = { id: string; title: string; url: string };
type LiveFacts = {
  kind: 'schedule' | 'address';
  title: string;
  url: string;
  rows: { label: string; value: string }[];
  note: string;
  asOf: { block: string | null; checkedAt: string | null };
  available: boolean;
};
type Reply = {
  kind: string;
  paragraphs: string[];
  steps?: string[];
  sources: Source[];
  related?: Source[];
  links: { title: string; url: string }[];
  followUps?: string[];
  live?: LiveFacts;
  knowledgeVersion?: string;
};
type Turn = {
  id: number;
  question: string;
  reply?: Reply;
  rating?: 'up' | 'down';
};
type Stage = 'lookup' | 'reading' | 'writing' | 'checking';
const stageLabels: Record<Stage, string> = {
  lookup: 'Checking public chain data…',
  reading: 'Reading the guide…',
  writing: 'Writing the answer…',
  checking: 'Checking sources…',
};
const pageContexts = [
  'overview',
  'schedule',
  'cancel',
  'transaction',
  'proof',
  'borrowing',
  'workspace',
  'pay',
  'docs',
] as const;
type PageContext = (typeof pageContexts)[number];
const STORAGE_KEY = 'runway-assistant-conversation-v1';
const REQUEST_TIMEOUT_MS = 65000;

const suggestions = [
  {
    title: 'Pay a contractor',
    detail: 'From funding to their first claim',
    question: 'How do I pay a contractor with Runway?',
  },
  {
    title: 'Understand MUSD',
    detail: 'Bitcoin-backed borrowing, explained',
    question: 'What is MUSD and how does it work with Mezo?',
  },
  {
    title: 'Funded or paid?',
    detail: 'Make sense of invoice statuses',
    question: 'What is the difference between funded and paid?',
  },
  {
    title: 'Cancel a schedule',
    detail: 'What gets refunded, and to whom',
    question: 'What happens when I cancel a payment schedule?',
  },
  {
    title: 'Client payment links',
    detail: 'Share a /pay checkout link',
    question: 'How do client payment links work in Runway?',
  },
  {
    title: 'Team & payroll runs',
    detail: 'Roles, approvals, and funding proofs',
    question: 'How do team roles, approval quorums, and payroll runs work?',
  },
];

function extractQuickLinks(text: string): { title: string; url: string }[] {
  const links: { title: string; url: string }[] = [];
  const addressMatch = /\b(0x[a-fA-F0-9]{40})\b/.exec(text);
  if (addressMatch && BigInt(addressMatch[1]) !== 0n) {
    const addr = addressMatch[1];
    const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    links.push({
      title: `View funding proof (${short})`,
      url: `/proof/${addr}`,
    });
  }
  const scheduleMatch = /\b(?:schedule|payment)\s*#?(\d{1,9})\b/i.exec(text);
  if (scheduleMatch && Number(scheduleMatch[1]) > 0) {
    const id = scheduleMatch[1];
    links.push({
      title: `Open Schedule #${id}`,
      url: `/schedules/${id}`,
    });
  }
  return links;
}

/** Conversation survives a reload in this tab only; New chat or closing the tab clears it. */
function loadTurns(): Turn[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved)
      ? saved.filter(
          (turn): turn is Turn =>
            typeof turn?.id === 'number' &&
            typeof turn?.question === 'string' &&
            Array.isArray(turn?.reply?.paragraphs),
        )
      : [];
  } catch {
    return [];
  }
}
function saveTurns(turns: Turn[]) {
  try {
    const complete = turns.filter((turn) => turn.reply).slice(-20);
    if (complete.length)
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(complete));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); memory still works.
  }
}

const reviewedLabel = (version?: string) => {
  if (!version || !/^\d{4}-\d{2}-\d{2}$/.test(version)) return '';
  return `Docs reviewed ${new Date(`${version}T00:00:00Z`).toLocaleDateString(
    undefined,
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
  )}`;
};

/** Reads `event:`/`data:` frames from a server-sent event stream. */
async function readEvents(
  response: Response,
  onEvent: (event: string, data: string) => void,
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary: number;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
      let event = 'message';
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) onEvent(event, data.join('\n'));
    }
    if (done) return;
  }
}

function LiveFactsCard({ live }: { live: LiveFacts }) {
  const checked = live.asOf.checkedAt
    ? new Date(live.asOf.checkedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  return (
    <section className="assistant-live" aria-label={`Live data: ${live.title}`}>
      <div className="assistant-live-head">
        <span className="badge">PUBLIC CHAIN DATA</span>
        <a href={live.url}>
          {live.title} <span aria-hidden="true">→</span>
        </a>
      </div>
      {live.rows.length ? (
        <dl>
          {live.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="hint">
        {live.note}
        {live.asOf.block
          ? ` Index block ${live.asOf.block}${checked ? `, checked ${checked}` : ''}.`
          : ''}
      </p>
    </section>
  );
}

export function Assistant() {
  const [turns, setTurns] = useState<Turn[]>(loadTurns);
  const [question, setQuestion] = useState(
    () =>
      new URLSearchParams(window.location.search).get('q')?.slice(0, 1200) ??
      '',
  );
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>('reading');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const wake = useBackendWake();
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const latest = useRef<HTMLElement>(null);
  const sequence = useRef(
    turns.reduce((max, turn) => Math.max(max, turn.id), 0),
  );
  // The page that opened the assistant, kept for this conversation as a hint.
  const context = useRef<PageContext | undefined>(
    (() => {
      const from = new URLSearchParams(window.location.search).get('from');
      return pageContexts.find((page) => page === from);
    })(),
  );
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    latest.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [turns.length]);
  useEffect(() => saveTurns(turns), [turns]);

  function clear() {
    wake.reset();
    controller.current?.abort();
    controller.current = null;
    sequence.current++;
    context.current = undefined;
    setTurns([]);
    setQuestion('');
    setError('');
    setBusy(false);
    input.current?.focus();
  }
  function stop() {
    controller.current?.abort();
    controller.current = null;
    sequence.current++;
    setBusy(false);
    setError('Answer stopped. You can retry or ask another question.');
  }
  function rate(turn: Turn, rating: 'up' | 'down') {
    if (turn.rating || !turn.reply) return;
    setTurns((current) =>
      current.map((t) => (t.id === turn.id ? { ...t, rating } : t)),
    );
    // Anonymous: only the rating and cited section IDs, never question or answer text.
    void apiFetch('/api/assistant/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating,
        sources: turn.reply.sources.map((source) => source.id),
      }),
    }).catch(() => {});
  }
  async function ask(text: string, retry = false) {
    if (busy || controller.current || !text.trim() || wake.status === 'waking')
      return;
    wake.reset();
    const prompt = text.trim();
    const previous = retry ? turns.slice(0, -1) : turns;
    // Prior questions plus the section IDs their answers cited; never answer text.
    const history = previous
      .filter((turn) => turn.reply?.kind === 'answer')
      .slice(-6)
      .map((turn) =>
        turn.reply?.sources.length
          ? {
              question: turn.question,
              sources: turn.reply.sources.map((source) => source.id),
            }
          : turn.question,
      );
    const id = ++sequence.current;
    const pending = [...previous, { id, question: prompt }];
    setTurns(pending);
    setQuestion('');
    setError('');
    setStage('reading');
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, REQUEST_TIMEOUT_MS + 1000);
    try {
      const response = await apiFetch(
        '/api/assistant/chat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
          },
          body: JSON.stringify({
            question: prompt,
            history,
            ...(context.current ? { context: context.current } : {}),
          }),
          signal: abort.signal,
        },
        REQUEST_TIMEOUT_MS,
      );
      let reply: Reply | undefined;
      if (
        response.ok &&
        response.body &&
        /text\/event-stream/.test(response.headers.get('content-type') ?? '')
      ) {
        let failure = '';
        await readEvents(response, (event, data) => {
          if (sequence.current !== id) return;
          if (event === 'stage' && data in stageLabels) setStage(data as Stage);
          else if (event === 'reply') reply = JSON.parse(data) as Reply;
          else if (event === 'error')
            failure =
              (JSON.parse(data) as { error?: string }).error ??
              'The assistant could not finish that answer.';
        });
        if (failure) throw new Error(failure);
        if (!reply)
          throw new Error(
            'The answer was interrupted before it finished. Please retry.',
          );
      } else {
        const data = await readJson<Reply & { error?: string }>(response);
        if (!response.ok)
          throw new Error(
            data?.error ||
              'The assistant is waking up or unavailable. Please try again shortly.',
          );
        reply = data;
      }
      if (sequence.current !== id) return;
      setTurns([...previous, { id, question: prompt, reply }]);
    } catch (failure) {
      if (sequence.current !== id) return;
      if (failure instanceof BackendUnavailableError) {
        // Restore the failed prompt unless the user has already drafted a new one.
        setQuestion((current) => current || prompt);
        wake.wake();
        return;
      }
      setError(
        timedOut
          ? 'The answer took too long. Please retry.'
          : failure instanceof Error && failure.name !== 'AbortError'
            ? failure.message
            : 'Answer stopped. You can retry.',
      );
    } finally {
      clearTimeout(timer);
      if (sequence.current === id) {
        setBusy(false);
        controller.current = null;
        input.current?.focus();
      }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }
  function keyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      if (!busy) void ask(question);
    }
  }
  function copy(turn: Turn) {
    const reply = turn.reply;
    if (!reply) return;
    const text = [
      ...reply.paragraphs,
      ...(reply.steps ?? []).map((step, i) => `${i + 1}. ${step}`),
    ].join('\n\n');
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(turn.id);
        setTimeout(() => setCopiedId((c) => (c === turn.id ? null : c)), 2000);
      })
      .catch(() => {});
  }
  const last = turns.at(-1);
  return (
    <div className="shell assistant-shell">
      <a className="skip-link" href="#assistant">
        Skip to assistant
      </a>
      <Sidebar active="assistant" />
      <main id="assistant" tabIndex={-1}>
        <header className="topbar">
          <span>ASK RUNWAY</span>
          <div className="assistant-top-actions">
            <span className="badge">MEZO TESTNET</span>
            <button className="assistant-new" onClick={clear}>
              <span aria-hidden="true">＋</span> New chat
            </button>
          </div>
        </header>
        <div
          className={`assistant-content ${turns.length ? 'has-conversation' : ''}`}
        >
          {!turns.length && (
            <section
              className="assistant-welcome"
              aria-labelledby="assistant-title"
            >
              <div className="assistant-symbol" aria-hidden="true">
                r<span>✦</span>
              </div>
              <p className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</p>
              <h1 id="assistant-title">
                What would you like
                <br />
                to understand?
              </h1>
              <p>
                Ask about Runway, payments, or Mezo.
                <br className="assistant-mobile-break" /> We’ll help you find
                your next step.
              </p>
            </section>
          )}
          {turns.length > 0 && (
            <section
              className="assistant-conversation"
              aria-label="Conversation"
            >
              {turns.map((turn, index) => {
                const reply = turn.reply;
                const isLast = index === turns.length - 1;
                const reviewed = reviewedLabel(reply?.knowledgeVersion);
                return (
                  <article
                    key={turn.id}
                    ref={isLast ? latest : undefined}
                    className="assistant-turn"
                    aria-label={`Question ${index + 1}`}
                  >
                    <div className="assistant-question">
                      <span className="assistant-speaker">YOU</span>
                      <p>{turn.question}</p>
                    </div>
                    <div className="assistant-answer">
                      <div className="assistant-answer-label">
                        <span
                          className="assistant-mini-mark"
                          aria-hidden="true"
                        >
                          r
                        </span>
                        <span>Runway</span>
                        <span className="assistant-answer-type">
                          {reply
                            ? reply.live
                              ? 'GUIDE + CHAIN DATA'
                              : 'GUIDE'
                            : busy
                              ? 'THINKING'
                              : 'PAUSED'}
                        </span>
                      </div>
                      {reply ? (
                        <>
                          {reply.paragraphs.map((paragraph, i) => (
                            <p key={i}>{paragraph}</p>
                          ))}
                          {reply.steps?.length ? (
                            <ol className="assistant-steps">
                              {reply.steps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                          ) : null}
                          {reply.live ? (
                            <LiveFactsCard live={reply.live} />
                          ) : null}
                          {reply.kind === 'live_data' && isLast ? (
                            <LiveAccountCard />
                          ) : null}
                          {!!reply.sources.length && (
                            <nav
                              className="assistant-sources"
                              aria-label={`Sources for answer ${index + 1}`}
                            >
                              <span>Sources</span>
                              {reply.sources.map((source) => (
                                <a
                                  key={source.id}
                                  href={source.url}
                                  {...(source.url.startsWith('https://')
                                    ? { target: '_blank', rel: 'noreferrer' }
                                    : {})}
                                >
                                  {source.title}
                                  <span aria-hidden="true"> ↗</span>
                                </a>
                              ))}
                            </nav>
                          )}
                          {!!reply.related?.length && (
                            <nav
                              className="assistant-sources"
                              aria-label={`Closest guide sections for question ${index + 1}`}
                            >
                              <span>Closest guide sections</span>
                              {reply.related.map((source) => (
                                <a
                                  key={source.id}
                                  href={source.url}
                                  {...(source.url.startsWith('https://')
                                    ? { target: '_blank', rel: 'noreferrer' }
                                    : {})}
                                >
                                  {source.title}
                                  <span aria-hidden="true"> ↗</span>
                                </a>
                              ))}
                            </nav>
                          )}
                          <div className="assistant-next-links">
                            {[
                              ...reply.links,
                              ...extractQuickLinks(turn.question).filter(
                                (q) =>
                                  q.url !== reply.live?.url &&
                                  !reply.links.some((l) => l.url === q.url),
                              ),
                            ].map((link) => (
                              <a key={link.url} href={link.url}>
                                {link.title} <span aria-hidden="true">→</span>
                              </a>
                            ))}
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => copy(turn)}
                            >
                              {copiedId === turn.id
                                ? 'Copied answer'
                                : 'Copy answer'}
                            </button>
                          </div>
                          {reply.kind === 'answer' && (
                            <div
                              className="assistant-feedback"
                              role="group"
                              aria-label={`Rate answer ${index + 1}`}
                            >
                              {turn.rating ? (
                                <span role="status">
                                  Thanks — this helps improve the guide.
                                </span>
                              ) : (
                                <>
                                  <span>Was this helpful?</span>
                                  <button
                                    type="button"
                                    aria-label="Helpful"
                                    onClick={() => rate(turn, 'up')}
                                  >
                                    <span aria-hidden="true">👍</span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Not helpful"
                                    onClick={() => rate(turn, 'down')}
                                  >
                                    <span aria-hidden="true">👎</span>
                                  </button>
                                </>
                              )}
                              {reviewed ? (
                                <span className="assistant-reviewed">
                                  {reviewed}
                                </span>
                              ) : null}
                            </div>
                          )}
                          {isLast && !busy && !!reply.followUps?.length && (
                            <div
                              className="assistant-followups"
                              aria-label="Suggested follow-up questions"
                            >
                              {reply.followUps.map((followUp) => (
                                <button
                                  key={followUp}
                                  type="button"
                                  onClick={() => void ask(followUp)}
                                >
                                  {followUp}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : busy && isLast ? (
                        <div className="assistant-thinking" role="status">
                          <span aria-hidden="true" />
                          {stageLabels[stage]}
                        </div>
                      ) : (
                        <p className="assistant-muted">No answer received.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
          <div className="assistant-compose-area">
            <BackendWakeNotice wake={wake} />
            {wake.status === 'ready' && (
              <p className="hint" role="status">
                The backend is ready. Send your question when you are ready.
              </p>
            )}
            {error && (
              <div className="assistant-error" role="alert">
                <p>{error}</p>
                {last && !last.reply && (
                  <button
                    onClick={() => void ask(last.question, true)}
                    disabled={busy}
                  >
                    Retry answer
                  </button>
                )}
                <a href="/docs">Open the guide</a>
              </div>
            )}
            <form className="assistant-composer" onSubmit={submit}>
              <label className="sr-only" htmlFor="assistant-question">
                Ask about Runway or Mezo
              </label>
              <textarea
                id="assistant-question"
                ref={input}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={keyboard}
                placeholder={
                  turns.length
                    ? 'Ask a follow-up…'
                    : 'Ask anything about Runway or Mezo…'
                }
                maxLength={1200}
                rows={2}
              />
              <div className="assistant-composer-bottom">
                <span>
                  {question.length > 1000
                    ? `${question.length}/1200`
                    : 'Runway & Mezo knowledge'}
                  <span className="assistant-enter-hint">
                    {' '}
                    · Shift + Enter for a new line
                  </span>
                </span>
                {busy ? (
                  <button
                    type="button"
                    className="assistant-send"
                    aria-label="Stop answer"
                    onClick={stop}
                  >
                    <span aria-hidden="true">■</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="assistant-send"
                    aria-label="Send question"
                    disabled={!question.trim() || wake.status === 'waking'}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                )}
              </div>
            </form>
            <p className="assistant-footnote">
              Grounded in the docs and public schedule data. No wallet access or
              actions.
              <br className="assistant-mobile-break" /> Questions are sent to
              Gemini. Don’t share secrets.
            </p>
          </div>
          {!turns.length && (
            <div
              className="assistant-suggestions"
              aria-label="Suggested questions"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.title}
                  onClick={() => void ask(suggestion.question)}
                >
                  <span className="assistant-suggestion-top">
                    {suggestion.title}
                    <span aria-hidden="true">↗</span>
                  </span>
                  <span>{suggestion.detail}</span>
                </button>
              ))}
            </div>
          )}
          <span className="sr-only" role="status">
            {!busy && last?.reply ? 'Answer ready.' : ''}
          </span>
        </div>
      </main>
    </div>
  );
}
