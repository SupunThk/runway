import { MongoClient, type Db } from 'mongodb';
import { backfillSettlements } from './settlements.ts';

let connection: Promise<Db> | undefined;

export async function initializeDatabase(db: Db) {
  await Promise.all([
    db
      .collection('workspaceMembers')
      .createIndex({ workspaceId: 1, address: 1 }, { unique: true }),
    db.collection('workspaceMembers').createIndex({ address: 1, status: 1 }),
    db
      .collection('workspaceAudit')
      .createIndex({ workspaceId: 1, createdAt: -1 }),
    db
      .collection('workspaceAudit')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('recurringPlans').createIndex({ workspaceId: 1, _id: 1 }),
    db.collection('payrollRuns').createIndex({ workspaceId: 1, _id: 1 }),
    db
      .collection('payrollRuns')
      .createIndex({ workspaceId: 1, invoiceIds: 1 }, { unique: true }),
    db.collection('invoices').createIndex({ submittedBy: 1, createdAt: -1 }),
    db
      .collection('invoices')
      .createIndex({ recurrenceKey: 1 }, { unique: true, sparse: true }),
    db
      .collection('requestMetrics')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection('paymentRequests')
      .createIndex({ token: 1 }, { unique: true }),
    db.collection('paymentRequests').createIndex({ workspaceId: 1, _id: 1 }),
    db
      .collection('settlementClaims')
      .createIndex({ targetType: 1, targetId: 1 }, { unique: true }),
    db
      .collection('workspaceActivity')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection('workspaceActivity')
      .createIndex({ day: 1, owner: 1 }, { unique: true }),
    ...['assistantMetrics', 'adminAccess', 'serviceStarts'].map((name) =>
      db
        .collection(name)
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ),
    db.collection('adminAccess').createIndex({ lastSeenAt: -1 }),
    db.collection('serviceStarts').createIndex({ startedAt: -1 }),
    db.collection('assistantMetrics').createIndex({ day: 1 }),
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
  await backfillSettlements(db);
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
