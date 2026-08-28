export type Entitlements = {
  features: string[];
  limits: {
    adminUsers: number | null;
    members: number | null;
    historyMonths: number | null;
  };
};

export type PlanRecord = {
  code: string;
  name: string;
  entitlements: Entitlements;
  active: boolean;
};

/** Global (no TENANT_ID) — platform-defined, not tenant-owned. */
export interface PlanRepository {
  findByCode(code: string): Promise<PlanRecord | null>;
  listActive(): Promise<PlanRecord[]>;
}
