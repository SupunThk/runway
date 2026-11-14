export type AdminOverview = {
  generatedAt: string;
  cached?: boolean;
  environment: 'testnet';
  alerts?: {
    level: 'critical' | 'warning' | 'info';
    code: string;
    message: string;
  }[];
  funnel?: {
    created: number;
    contractorSubmitted: number;
    reviewed: number;
    rejected: number;
    inPayrollRun: number;
    paymentLinked: number;
    medianHoursToPayment: number | null;
    timedSamples: number;
  };
  assistant?: {
    questions: number;
    failed: number;
    answered: number;
    declined: number;
    averageMs: number | null;
    lookups?: number;
    rates?: {
      unsupported: number | null;
      outOfScope: number | null;
      liveData: number | null;
    };
    ratings?: { up: number; down: number };
    topSources: { id: string; citations: number }[];
    gapSources?: { id: string; unanswered: number; downvotes: number }[];
    daily: { date: string; questions: number }[];
  };
  range: { days: number; from: string; to: string };
  usage: {
    workspaces: number;
    ownerWallets: number;
    contractors: number;
    invoices: number;
    linkedDirectInvoices: number;
    teamMembers?: number;
    payrollRuns?: number;
    recurringPlans?: number;
    paymentRequests?: number;
    settledPaymentRequests?: number;
    activeWallets: number | null;
    returningWallets: number | null;
    trackingSince: string | null;
    daily: { date: string; wallets: number | null; requests: number | null }[];
  };
  revenue: {
    status: 'not_collecting_fees';
    currency: 'MUSD';
    grossBaseUnits: null;
    refundBaseUnits: null;
    netBaseUnits: null;
    note: string;
    pricingModel?: {
      workspaceMonthlyFeeBaseUnits: string;
      scheduleFeeBps: number;
      scheduleFeeCapBaseUnits: string;
      monthlySubscriptionEquivalentBaseUnits: string;
      volumeFeeEquivalentBaseUnits: string | null;
    };
  };
  payments: {
    available: boolean;
    partial: boolean;
    loaded: number;
    sourceBlock: string | null;
    checkedAt: string | null;
    fundedBaseUnits: string | null;
    claimedBaseUnits: string | null;
    refundedBaseUnits: string | null;
    committedBaseUnits: string | null;
  };
  health: {
    database: 'connected';
    databasePingMs?: number;
    indexer?: {
      configured: boolean;
      ready: boolean;
      error: string | null;
      indexedBlock: string | null;
      headBlock: string | null;
      lagBlocks: number | null;
      confirmations: number;
      checkedAt: string | null;
    };
    starts?: {
      inRange: number;
      last24Hours: number;
      lastStartedAt: string | null;
      byDay: Record<string, number>;
    };
    adminAccess?: {
      wallet: string;
      day: string;
      requests: number;
      lastSeenAt: string;
    }[];
    reconciliation: 'current' | 'unavailable';
    requestErrorCount: number | null;
    reconciliationAgeSeconds: number | null;
    requests: null | {
      available: boolean;
      from: string;
      to: string;
      observedSince: string;
      requests: number;
      serverErrors: number;
      clientErrors: number;
      averageMs: number | null;
      p95UpperBoundMs: number | null;
      maxMs: number;
      byFamily?: Record<
        string,
        {
          requests: number;
          serverErrors: number;
          clientErrors: number;
          averageMs: number | null;
        }
      >;
      note: string;
    };
    operatingCost: null | {
      kind: 'actual';
      amountUsd: string;
      periodStart: string;
      periodEnd: string;
      recordedAt: string;
      source: string;
      stale: boolean;
      note: string;
    };
  };
};
