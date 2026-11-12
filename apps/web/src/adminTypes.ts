export type AdminOverview = {
  generatedAt: string;
  environment: 'testnet';
  range: { days: number; from: string; to: string };
  usage: {
    workspaces: number;
    ownerWallets: number;
    contractors: number;
    invoices: number;
    linkedDirectInvoices: number;
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
