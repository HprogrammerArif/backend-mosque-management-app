import type { Server } from 'node:http';
import request from 'supertest';

export const idem = () => ({ 'Idempotency-Key': crypto.randomUUID() });

export type TenantFixture = {
  accessToken: string;
  userId: string;
  mosqueId: string;
  fundId: string;
};

/**
 * Registers a fresh user, provisions a mosque (which seeds default funds + a BASIC
 * subscription in the same transaction — mosques.service.ts), and returns everything a
 * cross-module e2e test typically needs: a bearer token, the mosque, and one fund id to
 * attach donations/expenses to. Each call uses a random identifier, so tests calling this
 * repeatedly never collide on AUTH_EMAIL_TAKEN even without a table reset between them.
 */
export async function createTenant(server: Server): Promise<TenantFixture> {
  const api = request(server);
  const email = `test-${crypto.randomUUID()}@example.com`;

  const reg = await api.post('/api/v1/auth/register').send({
    email, password: 'correct-horse-battery', displayName: 'Test Admin', locale: 'en',
  });
  if (reg.status !== 201) {
    throw new Error(`Fixture registration failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  }
  const accessToken = reg.body.accessToken as string;
  const userId = reg.body.user.id as string;

  const mosque = await api.post('/api/v1/mosques')
    .set('Authorization', `Bearer ${accessToken}`).set(idem())
    .send({ name: 'Test Masjid', timezone: 'Asia/Dhaka', latitude: 23.8, longitude: 90.4 });
  if (mosque.status !== 201) {
    throw new Error(`Fixture mosque creation failed: ${mosque.status} ${JSON.stringify(mosque.body)}`);
  }
  const mosqueId = mosque.body.id as string;

  const funds = await api.get(`/api/v1/mosques/${mosqueId}/funds`)
    .set('Authorization', `Bearer ${accessToken}`);
  const fundId = (funds.body as { id: string }[])[0]?.id;
  if (fundId === undefined) throw new Error('Fixture mosque has no seeded funds');

  return { accessToken, userId, mosqueId, fundId };
}
