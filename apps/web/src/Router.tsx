import { lazy, Suspense, useEffect, useState, type MouseEvent } from 'react';
import { App } from './App';
import { RouteFallback } from './RouteFallback';

const Documentation = lazy(() =>
  import('./Documentation').then((m) => ({ default: m.Documentation })),
);
// Resolve a direct Workspace entry before mounting so reloads expose its real
// wallet/session controls immediately. Other entries fetch it on navigation.
const Workspace = /^\/workspace\/?$/.test(window.location.pathname)
  ? (await import('./Workspace')).Workspace
  : lazy(() => import('./Workspace').then((m) => ({ default: m.Workspace })));
const Borrowing = lazy(() =>
  import('./Borrowing').then((m) => ({ default: m.Borrowing })),
);
const Assistant = lazy(() =>
  import('./Assistant').then((m) => ({ default: m.Assistant })),
);

const currentRoute = () => window.location.pathname + window.location.search;

export function Router() {
  const [route, setRoute] = useState(currentRoute);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element).closest('a');
    if (
      !link ||
      link.hasAttribute('download') ||
      (link.target && link.target !== '_self')
    )
      return;
    const url = new URL(link.href);
    if (
      url.origin !== window.location.origin ||
      url.hash ||
      !/^\/(?:docs\/?|workspace\/?|borrowing\/?|assistant\/?|schedules\/[^/]+\/?)?$/.test(
        url.pathname,
      )
    )
      return;
    event.preventDefault();
    const next = url.pathname + url.search;
    if (next !== route) window.history.pushState(null, '', next);
    setRevision((value) => value + 1);
    setRoute(next);
    window.scrollTo(0, 0);
  }

  const pathname = route.split('?')[0];
  return (
    <div className="router" onClick={navigate}>
      <Suspense fallback={<RouteFallback />}>
        {/^\/assistant\/?$/.test(pathname) ? (
          <Assistant />
        ) : /^\/docs\/?$/.test(pathname) ? (
          <Documentation />
        ) : /^\/workspace\/?$/.test(pathname) ? (
          <Workspace />
        ) : /^\/borrowing\/?$/.test(pathname) ? (
          <Borrowing />
        ) : (
          <App key={`${route}:${revision}`} />
        )}
      </Suspense>
    </div>
  );
}
