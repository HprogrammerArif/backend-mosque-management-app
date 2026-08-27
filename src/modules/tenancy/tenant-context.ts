import type { Role } from '../../domain/enums.js';

export type TenantContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: Role;
};
