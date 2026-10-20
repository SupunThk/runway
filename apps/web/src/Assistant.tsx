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

type Reply = {
  kind: string;
  paragraphs: string[];
  sources: { id: string; title: string; url: string }[];
  links: { title: string; url: string }[];
};
type Turn = { id: number; question: string; reply?: Reply };
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
];

export function Assistant() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wake = useBackendWake();
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const latest = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    latest.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [turns.length]);

  function clear() {
    wake.reset();
    controller.current?.abort();
    controller.current = null;
    sequence.current++;
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
  async function ask(text: string, retry = false) {
    if (busy || controller.current || !text.trim() || wake.status === 'waking')
      return;
    wake.reset();
    const prompt = text.trim();
    const previous = retry ? turns.slice(0, -1) : turns;
    const history = previous
      .filter((turn) => turn.reply?.kind === 'answer')
      .slice(-6)
      .map((turn) => turn.question);
    const id = ++sequence.current;
    const pending = [...previous, { id, question: prompt }];
    setTurns(pending);
    setQuestion('');
    setError('');
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await apiFetch(
        '/api/assistant/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: prompt, history }),
          signal: abort.signal,
        },
        65000,
      );
      const data = await readJson<Reply & { error?: string }>(response);
      if (!response.ok)
        throw new Error(
          data?.error ||
            'The assistant is waking up or unavailable. Please try again shortly.',
        );
      if (sequence.current !== id) return;
      setTurns([...previous, { id, question: prompt, reply: data as Reply }]);
    } catch (failure) {
      if (sequence.current !== id) return;
      if (failure instanceof BackendUnavailableError) {
        // Restore the failed prompt unless the user has already drafted a new one.
        setQuestion((current) => current || prompt);
        wake.wake();
        return;
      }
      setError(
        failure instanceof Error && failure.name !== 'AbortError'
          ? failure.message
          : 'Answer stopped. You can retry.',
      );
    } finally {
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
              {turns.map((turn, index) => (
                <article
                  key={turn.id}
                  ref={index === turns.length - 1 ? latest : undefined}
                  className="assistant-turn"
                  aria-label={`Question ${index + 1}`}
                >
                  <div className="assistant-question">
                    <span className="assistant-speaker">YOU</span>
                    <p>{turn.question}</p>
                  </div>
                  <div className="assistant-answer">
                    <div className="assistant-answer-label">
                      <span className="assistant-mini-mark" aria-hidden="true">
                        r
                      </span>
                      <span>Runway</span>
                      <span className="assistant-answer-type">
                        {turn.reply ? 'GUIDE' : busy ? 'THINKING' : 'PAUSED'}
                      </span>
                    </div>
                    {turn.reply ? (
                      <>
                        {turn.reply.paragraphs.map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                        {!!turn.reply.sources.length && (
                          <nav
                            className="assistant-sources"
                            aria-label={`Sources for answer ${index + 1}`}
                          >
                            <span>Sources</span>
                            {turn.reply.sources.map((source) => (
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
                        {!!turn.reply.links.length && (
                          <div className="assistant-next-links">
                            {turn.reply.links.map((link) => (
                              <a key={link.url} href={link.url}>
                                {link.title} <span aria-hidden="true">→</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    ) : busy && index === turns.length - 1 ? (
                      <div className="assistant-thinking" role="status">
                        <span aria-hidden="true" />
                        Reading the guide…
                      </div>
                    ) : (
                      <p className="assistant-muted">No answer received.</p>
                    )}
                  </div>
                </article>
              ))}
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
              Grounded in the docs. No wallet access or actions.
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
