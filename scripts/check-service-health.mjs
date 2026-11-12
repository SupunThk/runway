// Public, read-only checks. No dotenv, wallet, credentials or private records.
import { performance } from 'node:perf_hooks';

const localIndex = process.argv.indexOf('--local');
const local =
  localIndex >= 0 ? new URL(process.argv[localIndex + 1]) : undefined;
if (
  local &&
  (local.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(local.hostname))
)
  throw new Error('--local accepts a localhost HTTP origin only.');
const bases = local
  ? [local.origin]
  : [
      'https://runway-api-rw61.onrender.com',
      'https://mezo-runway-testnet.vercel.app',
    ];
async function probe(base, path, expected) {
  const started = performance.now();
  try {
    const response = await fetch(base + path, {
      signal: AbortSignal.timeout(90000),
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    const result = await response.json();
    const ready =
      response.status === expected &&
      (path !== '/api/health' ||
        (result.status === 'ready' && result.database === 'connected'));
    return {
      base,
      path,
      status: response.status,
      milliseconds: Math.round(performance.now() - started),
      requestId: response.headers.get('x-request-id'),
      ready,
      ...(path === '/api/health'
        ? {
            database: result.database ?? null,
            readiness: result.status ?? null,
          }
        : {}),
    };
  } catch (error) {
    return {
      base,
      path,
      milliseconds: Math.round(performance.now() - started),
      ready: false,
      error:
        error.name === 'TimeoutError'
          ? 'Timed out after 90 seconds; cold start, connectivity and service health require separate diagnosis.'
          : 'Could not obtain a valid JSON response.',
    };
  }
}
const initial = await Promise.all(
  bases.flatMap((base) => [
    probe(base, '/api/health', 200),
    probe(base, '/api/auth/session', 401),
  ]),
);
// A second health sample measures the warm service independently of the first wake.
const warm = await Promise.all(
  bases.map((base) => probe(base, '/api/health', 200)),
);
const report = {
  checkedAt: new Date().toISOString(),
  kind: 'public-read-only-health',
  initial,
  warm,
  passed: [...initial, ...warm].every((r) => r.ready),
  note: 'Each origin is checked independently. A Ready deployment is not proof of runtime readiness. No outage cause is inferred from a timeout alone.',
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
