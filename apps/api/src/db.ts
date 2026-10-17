import { MongoClient, type Db } from 'mongodb';

let connection: Promise<Db> | undefined;

export async function initializeDatabase(db: Db) {
  await Promise.all([
    db
      .collection('challenges')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection('sessions')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection('rateLimits')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('workspaces').createIndex({ owner: 1, _id: 1 }),
    db.collection('contractors').createIndex({ workspaceId: 1, _id: 1 }),
    db
      .collection('contractors')
      .createIndex({ workspaceId: 1, address: 1 }, { unique: true }),
    db.collection('invoices').createIndex({ workspaceId: 1, _id: 1 }),
    db
      .collection('invoices')
      .createIndex({ paymentKey: 1 }, { unique: true, sparse: true }),
    db
      .collection('invoices')
      .createIndex({ paymentReference: 1 }, { unique: true, sparse: true }),
    db
      .collection('paymentSchedules')
      .createIndex({ generation: 1, referenceHash: 1 }),
    db
      .collection('paymentSchedules')
      .createIndex({ generation: 1, scheduleId: 1 }, { unique: true }),
    db
      .collection('paymentSchedules')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export function database(): Promise<Db> {
  if (!connection) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('DATABASE_NOT_CONFIGURED');
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 15000,
    });
    connection = (async () => {
      try {
        await client.connect();
        const db = client.db(process.env.MONGODB_DATABASE || 'runway');
        await initializeDatabase(db);
        return db;
      } catch (error) {
        connection = undefined;
        await client.close();
        throw error;
      }
    })();
  }
  return connection;
}
