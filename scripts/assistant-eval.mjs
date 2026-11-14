// Live Ask Runway evaluation against the configured Gemini model.
// Run after changing docs/assistant-knowledge.md, assistant prompts or the model:
//   pnpm eval:assistant            (fails on wrong reply kind)
//   pnpm eval:assistant --strict   (also fails when a required source is not cited)
// Skips cleanly when GEMINI_API_KEY is absent, so CI without the secret stays green.
// Each case is one paid model call; the full run is ~36 calls.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

if (!process.env.GEMINI_API_KEY) {
  console.log(
    'GEMINI_API_KEY is not set; skipping the live assistant evaluation.',
  );
  process.exit(0);
}
const { answerQuestion, createGeminiModel } =
  await import('../apps/api/src/assistant.ts');
const strict = process.argv.includes('--strict');
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const knowledgeCases = (
  await read('../tests/fixtures/assistant-eval.json')
).map((item) => ({
  question: item.question,
  expected: item.expectedScope === 'knowledge' ? 'answer' : item.expectedScope,
  requiredSources: item.requiredSources,
}));
const routingCases = await read('../tests/fixtures/assistant-routing.json');
const cases = [...knowledgeCases, ...routingCases];

const model = createGeminiModel();
const results = [];
for (const item of cases) {
  const started = Date.now();
  let row;
  try {
    const reply = await answerQuestion(
      {
        question: item.question,
        history: item.history ?? [],
        ...(item.context ? { context: item.context } : {}),
      },
      model,
      AbortSignal.timeout(45000),
    );
    const cited = reply.sources.map((source) => source.id);
    const missing = (item.requiredSources ?? []).filter(
      (id) => item.expected === 'answer' && !cited.includes(id),
    );
    row = {
      question: item.question,
      expected: item.expected,
      actual: reply.kind,
      kindPass: reply.kind === item.expected,
      missingSources: missing,
      cited,
      durationMs: Date.now() - started,
      reply,
    };
  } catch {
    row = {
      question: item.question,
      expected: item.expected,
      actual: 'error',
      kindPass: false,
      missingSources: [],
      durationMs: Date.now() - started,
    };
  }
  row.pass = row.kindPass && (!strict || row.missingSources.length === 0);
  results.push(row);
  const { reply: _reply, ...summary } = row;
  console.log(JSON.stringify(summary));
}

await mkdir(new URL('../.tools/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../.tools/assistant-eval.json', import.meta.url),
  JSON.stringify(results, null, 2) + '\n',
);
const passed = results.filter((row) => row.pass).length;
const sourceMisses = results.filter((row) => row.missingSources.length).length;
const durations = results.map((row) => row.durationMs).sort((a, b) => a - b);
console.log(
  `${passed}/${results.length} passed${strict ? ' (strict sources)' : ''}; ` +
    `${sourceMisses} answer(s) missed a required source; ` +
    `median ${durations[Math.floor(durations.length / 2)]} ms.`,
);
if (passed < results.length) process.exitCode = 1;
