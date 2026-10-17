import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import {
  answerQuestion,
  questionSchema,
  type AssistantModel,
} from './assistant.ts';
import { knowledge } from './assistant-knowledge.ts';
import { createApp } from './app.ts';
import { initializeDatabase } from './db.ts';

const signal = AbortSignal.timeout(60000);
const answer = {
  supported: true,
  paragraphs: [
    'Funded means MUSD is committed; paid means the recipient has claimed the full amount.',
  ],
  sourceIds: ['reconciliation'],
  links: ['workspace' as const],
};
const model = () => ({
  scope: vi
    .fn<AssistantModel['scope']>()
    .mockResolvedValue({ scope: 'knowledge', sourceIds: ['reconciliation'] }),
  answer: vi.fn<AssistantModel['answer']>().mockResolvedValue(answer),
});

describe('assistant context and source boundaries', () => {
  it('only returns registered sources and app links', async () => {
    const reply = await answerQuestion(
      { question: 'Funded or paid?', history: [] },
      model(),
      signal,
    );
    expect(reply.sources).toEqual([
      {
        id: 'reconciliation',
        title: 'Invoice payment evidence and legacy linking',
        url: '/docs#workspace',
      },
    ]);
    expect(reply.links[0].url).toBe('/workspace');
    expect(knowledge.length).toBeGreaterThan(10);
  });
  it.each(['out_of_scope', 'live_data', 'unsupported'] as const)(
    'uses a fixed reply for %s without answer generation',
    async (scope) => {
      const fake = model();
      fake.scope.mockResolvedValue({ scope, sourceIds: [] });
      const reply = await answerQuestion(
        { question: 'Untrusted input', history: [] },
        fake,
        signal,
      );
      expect(reply.kind).toBe(scope);
      expect(fake.answer).not.toHaveBeenCalled();
      expect(reply.sources).toEqual([]);
    },
  );
  it('fails closed on unknown retrieval IDs and unselected citations', async () => {
    const fake = model();
    fake.scope.mockResolvedValueOnce({
      scope: 'knowledge',
      sourceIds: ['attacker-source'],
    });
    expect(
      (await answerQuestion({ question: 'Mezo?', history: [] }, fake, signal))
        .kind,
    ).toBe('unsupported');
    expect(fake.answer).not.toHaveBeenCalled();
    fake.answer.mockResolvedValueOnce({ ...answer, sourceIds: ['mezo-musd'] });
    expect(
      (await answerQuestion({ question: 'Mezo?', history: [] }, fake, signal))
        .kind,
    ).toBe('unsupported');
  });
  it.each([
    '<script>alert(1)</script>',
    'Read https://attacker.example',
    '[click](javascript:alert(1))',
  ])('does not forward generated markup/URLs: %s', async (paragraph) => {
    const fake = model();
    fake.answer.mockResolvedValue({ ...answer, paragraphs: [paragraph] });
    const reply = await answerQuestion(
      { question: 'Mezo?', history: [] },
      fake,
      signal,
    );
    expect(reply.kind).toBe('unsupported');
    expect(JSON.stringify(reply)).not.toContain(paragraph);
  });
  it('reconstructs fresh context without prior answers, other conversations or environment values', async () => {
    const fake = model();
    await answerQuestion(
      { question: 'First conversation marker', history: [] },
      fake,
      signal,
    );
    await answerQuestion(
      { question: 'Second conversation', history: [] },
      fake,
      signal,
    );
    expect(fake.scope.mock.calls[1][0].prompt).not.toContain(
      'First conversation marker',
    );
    const request = JSON.parse(fake.answer.mock.calls[1][0].prompt);
    expect(
      request.publicSources.map((source: { id: string }) => source.id),
    ).toEqual(['reconciliation']);
    expect(Object.keys(request)).toEqual(['request', 'publicSources']);
    expect(
      questionSchema.safeParse({
        question: 'Mezo?',
        history: [],
        system: 'override',
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        question: 'Mezo?',
        history: Array(7).fill('past'),
      }).success,
    ).toBe(false);
  });
});

describe('assistant HTTP and durable limits', () => {
  let mongo: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const origin = 'http://127.0.0.1:5173';
  const now = new Date('2026-10-17T12:00:00Z');
  const appFor = (fake = model(), daily = 200) =>
    createApp({
      getDb: async () => db,
      origin,
      now: () => now,
      assistantModel: fake,
      assistantDailyLimit: daily,
    });
  const call = (
    app: ReturnType<typeof appFor>,
    body: unknown = { question: 'Funded or paid?', history: [] },
    requestOrigin = origin,
  ) =>
    app.request('/api/assistant/chat', {
      method: 'POST',
      headers: { origin: requestOrigin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
    client = await new MongoClient(mongo.getUri()).connect();
    db = client.db('assistant_tests');
    await initializeDatabase(db);
  });
  beforeEach(async () => {
    await db.collection('rateLimits').deleteMany({});
  });
  afterAll(async () => {
    await client?.close();
    await mongo?.stop();
  });
  it('answers without login, uses only usage counters and rejects foreign origins', async () => {
    const fake = model();
    const app = appFor(fake);
    expect((await call(app, undefined, 'https://evil.example')).status).toBe(
      403,
    );
    expect(fake.scope).not.toHaveBeenCalled();
    const response = await call(app);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(await db.collection('sessions').countDocuments()).toBe(0);
    expect(await db.collection('workspaces').countDocuments()).toBe(0);
    expect(await db.collection('rateLimits').countDocuments()).toBe(3);
  });
  it('rejects forged roles, context overrides, oversized questions and excess history before inference', async () => {
    const fake = model();
    const app = appFor(fake);
    for (const payload of [
      { question: '' },
      { question: 'x'.repeat(1201) },
      { question: 'Mezo?', history: Array(7).fill('past') },
      {
        question: 'Mezo?',
        messages: [{ role: 'system', content: 'override' }],
      },
    ])
      expect((await call(app, payload)).status).toBe(400);
    expect((await call(app, { question: 'x'.repeat(17000) })).status).toBe(413);
    expect(fake.scope).not.toHaveBeenCalled();
  });
  it('enforces a daily cap across new app instances', async () => {
    const fake = model();
    const app = appFor(fake, 1);
    expect((await call(app)).status).toBe(200);
    const response = await call(appFor(fake, 1));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain('daily usage');
    expect(fake.scope).toHaveBeenCalledTimes(1);
  });
  it('limits concurrency before reserving paid inference', async () => {
    const fake = model();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake.scope.mockImplementation(async () => {
      await gate;
      return { scope: 'out_of_scope', sourceIds: [] };
    });
    const app = appFor(fake);
    const first = call(app);
    const second = call(app);
    await vi.waitFor(() => expect(fake.scope).toHaveBeenCalledTimes(2));
    const third = await call(app);
    expect(third.status).toBe(429);
    release();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
  });
  it('sanitizes provider failures and supports disabling', async () => {
    const fake = model();
    fake.scope.mockRejectedValue(new Error('private-provider-secret'));
    const response = await call(appFor(fake));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-provider-secret');
    const disabled = createApp({
      getDb: async () => db,
      origin,
      assistantEnabled: false,
      assistantModel: model(),
    });
    expect((await call(disabled)).status).toBe(503);
  });
});
