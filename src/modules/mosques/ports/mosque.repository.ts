export type MosqueStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'PURGED';

export type MosqueRecord = {
  id: string;
  name: string;
  timezone: string;
  latitude: number;
  longitude: number;
  status: MosqueStatus;
};

export type CreateMosqueInput = {
  id: string;
  name: string;
  timezone: string;
  latitude: number;
  longitude: number;
  status: MosqueStatus;
};

/** Global table — no tenant scoping (mosques ARE the tenants, ADR-0003). */
export interface MosqueRepository {
  findById(id: string): Promise<MosqueRecord | null>;
  listByUser(userId: string): Promise<MosqueRecord[]>;
  create(input: CreateMosqueInput): Promise<MosqueRecord>;
}
