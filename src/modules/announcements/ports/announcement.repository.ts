export type AnnouncementRecord = {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  createdBy: string;
  createdAt: string;
};

export type CreateAnnouncementInput = {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  createdBy: string;
};

/** Tenant-owned (VPD-protected). */
export interface AnnouncementRepository {
  findById(id: string): Promise<AnnouncementRecord | null>;
  listRecent(limit: number): Promise<AnnouncementRecord[]>;
  create(input: CreateAnnouncementInput): Promise<AnnouncementRecord>;
}
