import type { ReactNode } from 'react';

export type AskRunwayContext =
  | 'overview'
  | 'schedule'
  | 'cancel'
  | 'transaction'
  | 'proof'
  | 'borrowing'
  | 'workspace'
  | 'pay';

/** Opens Ask Runway with a prefilled question and the page it came from. */
export function askRunwayHref(question: string, from: AskRunwayContext) {
  return `/assistant?${new URLSearchParams({ q: question, from })}`;
}

export function AskRunwayLink({
  question,
  from,
  children,
}: {
  question: string;
  from: AskRunwayContext;
  children: ReactNode;
}) {
  return (
    <a className="ask-runway-link" href={askRunwayHref(question, from)}>
      <span aria-hidden="true">✦ </span>
      {children}
    </a>
  );
}
