import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { serve } from '@hono/node-server';
import { createApp } from './src/app.ts';
import { initializeDatabase } from './src/db.ts';
import type { AssistantModel } from './src/assistant.ts';

// Temporary local database only; never reads MONGODB_URI or the user's data.
export async function startTestBackend(
  options: { assistantModel?: AssistantModel; origin?: string } = {},
) {
  const mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.17' },
  });
  const client = await new MongoClient(mongo.getUri()).connect();
  try {
    const db = client.db('runway_browser_tests');
    await initializeDatabase(db);
    const app = createApp({
      getDb: async () => db,
      origin: options.origin ?? 'http://127.0.0.1:5173',
      assistantModel: options.assistantModel,
    });
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) =>
      server.listening ? resolve() : server.once('listening', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test backend did not bind a port.');
    return {
      db,
      url: `http://127.0.0.1:${address.port}`,
      close: async () => {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await client.close();
        await mongo.stop();
      },
    };
  } catch (error) {
    await client.close();
    await mongo.stop();
    throw error;
  }
}
