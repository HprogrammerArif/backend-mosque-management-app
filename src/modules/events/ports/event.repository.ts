export type EventRecord = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  createdBy: string;
  createdAt: string;
};

export type CreateEventInput = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  createdBy: string;
};

/** Tenant-owned (VPD-protected). Gregorian storage — Hijri is a display concern (frontend's hijri-date.ts). */
export interface EventRepository {
  findById(id: string): Promise<EventRecord | null>;
  listUpcoming(limit: number): Promise<EventRecord[]>;
  create(input: CreateEventInput): Promise<EventRecord>;
}
