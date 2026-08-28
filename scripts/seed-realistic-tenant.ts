/**
 * Week 11 hardening: seeds one realistic tenant — 400 households, 18 months of
 * history, ~10,000 donations — for performance testing (list virtualisation, query
 * plans, startup) against real-shaped data volume rather than the handful of rows any
 * single feature test creates.
 *
 * Additive only: creates a brand-new mosque and never touches existing data (no
 * table reset, unlike the test suite's helpers). Safe to run against a dev database
 * that already has other tenants in it. Not idempotent — re-running creates a second
 * seed tenant, since the whole point is a fresh, large, realistic dataset each time.
 *
 * Seeds through POST /sync/push (the real offline-sync wire protocol, batched at its
 * 200-mutations-per-request limit) rather than one-row-at-a-time REST calls or direct
 * repository writes — ~54 requests instead of ~10,400, and it's the same code path a
 * real bulk-catchup sync would take, so the seed data is exactly as realistic as the
 * protocol it exercises.
 *
 * Run: pnpm tsx scripts/seed-realistic-tenant.ts
 */
import { uuidv7 } from 'uuidv7';
import request from 'supertest';
import { serializeHlc, type Hlc } from '../src/domain/hlc.js';

const HOUSEHOLD_COUNT = 400;
const DONATION_COUNT = 10_000;
const HISTORY_MONTHS = 18;
const BATCH_SIZE = 200;

const FIRST_NAMES = [
  'Abdul', 'Mohammed', 'Karim', 'Rahim', 'Yusuf', 'Ibrahim', 'Ismail', 'Hasan', 'Hussain',
  'Anwar', 'Jamal', 'Kamal', 'Rafiq', 'Shahid', 'Nasir', 'Faruk', 'Mizanur', 'Aminul',
  'Rashed', 'Delwar', 'Fatima', 'Ayesha', 'Khadija', 'Rahima', 'Sultana', 'Rokeya',
];
const LAST_NAMES = [
  'Rahman', 'Islam', 'Hossain', 'Ahmed', 'Khan', 'Chowdhury', 'Uddin', 'Alam', 'Miah',
  'Sarkar', 'Molla', 'Talukder', 'Sheikh', 'Bhuiyan', 'Mondol',
];
const AREAS = ['Mirpur', 'Mohammadpur', 'Uttara', 'Dhanmondi', 'Badda', 'Gulshan', 'Jatrabari', 'Khilgaon'];
const METHODS = ['CASH', 'BANK', 'MOBILE_MONEY', 'CARD', 'CHEQUE'] as const;

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error('pick() called on an empty array');
  return item;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDateWithinHistory(): string {
  const now = Date.now();
  const msIn18Months = HISTORY_MONTHS * 30 * 24 * 60 * 60 * 1000;
  const timestamp = now - Math.floor(Math.random() * msIn18Months);
  const iso = new Date(timestamp).toISOString();
  return iso.slice(0, 10);
}

let hlcCounter = 0;
function nextHlc(): string {
  hlcCounter += 1;
  const clock: Hlc = { wall: Date.now() + hlcCounter, counter: 0, node: 'seed-script' };
  return serializeHlc(clock);
}

async function pushBatch(
  api: ReturnType<typeof request>, mosqueId: string, token: string, mutations: unknown[],
): Promise<void> {
  const res = await api.post('/api/v1/sync/push')
    .set('Authorization', `Bearer ${token}`).set('X-Tenant-Id', mosqueId)
    .set('Idempotency-Key', uuidv7())
    .send({ deviceId: 'seed-script', mutations });

  if (res.status !== 201) {
    throw new Error(`Push batch failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const rejected = (res.body.results as { status: string; code?: string; message?: string }[])
    .filter((r) => r.status === 'rejected');
  if (rejected.length > 0) {
    throw new Error(`${rejected.length} mutations rejected: ${JSON.stringify(rejected.slice(0, 3))}`);
  }
}

async function main(): Promise<void> {
  const { createApp } = await import('../src/main.js');
  const app = await createApp();
  const api = request(app.server);

  console.log('Registering seed admin and provisioning the tenant...');
  const email = `seed-admin-${Date.now()}@masjidos.demo`;
  const password = 'seed-admin-password-123';
  const reg = await api.post('/api/v1/auth/register').send({
    email, password, displayName: 'Seed Admin', locale: 'en',
  });
  if (reg.status !== 201) throw new Error(`Registration failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const token = reg.body.accessToken as string;

  const mosque = await api.post('/api/v1/mosques')
    .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', uuidv7())
    .send({ name: 'Baitul Falah Jame Masjid (Seed)', timezone: 'Asia/Dhaka', latitude: 23.8103, longitude: 90.4125 });
  if (mosque.status !== 201) throw new Error(`Mosque creation failed: ${mosque.status} ${JSON.stringify(mosque.body)}`);
  const mosqueId = mosque.body.id as string;

  const fundsRes = await api.get(`/api/v1/mosques/${mosqueId}/funds`)
    .set('Authorization', `Bearer ${token}`);
  const funds = fundsRes.body as { id: string; type: string }[];
  const generalFund = funds.find((f) => f.type === 'GENERAL');
  const donationFunds = funds.filter((f) => ['GENERAL', 'ZAKAT', 'SADAQAH', 'LILLAH'].includes(f.type));
  if (!generalFund || donationFunds.length === 0) throw new Error('Expected seeded funds were not found');

  console.log(`Generating ${HOUSEHOLD_COUNT} households...`);
  const householdIds: string[] = [];
  const householdMutations = Array.from({ length: HOUSEHOLD_COUNT }, () => {
    const id = uuidv7();
    householdIds.push(id);
    const exempt = Math.random() < 0.05;
    return {
      mutationId: uuidv7(), entity: 'households' as const, entityId: id, op: 'insert' as const,
      hlc: nextHlc(), dependsOn: [],
      payload: {
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} Household`,
        addressLine1: `House ${randomInt(1, 60)}, Road ${randomInt(1, 20)}`,
        area: pick(AREAS), phone: null,
        monthlyDuesMinor: exempt ? 0 : randomInt(3, 10) * 10000,
        exempt, joinedOn: null,
      },
    };
  });

  for (let i = 0; i < householdMutations.length; i += BATCH_SIZE) {
    await pushBatch(api, mosqueId, token, householdMutations.slice(i, i + BATCH_SIZE));
    console.log(`  households ${Math.min(i + BATCH_SIZE, householdMutations.length)}/${HOUSEHOLD_COUNT}`);
  }

  console.log(`Generating ${DONATION_COUNT} donations across ${HISTORY_MONTHS} months...`);
  const donationMutations = Array.from({ length: DONATION_COUNT }, () => {
    const anonymous = Math.random() < 0.2;
    const tiedToHousehold = !anonymous && Math.random() < 0.4;
    return {
      mutationId: uuidv7(), entity: 'donations' as const, entityId: uuidv7(), op: 'insert' as const,
      hlc: nextHlc(), dependsOn: [],
      payload: {
        fundId: pick(donationFunds).id,
        amountMinor: randomInt(2, 500) * 100,
        currency: 'BDT',
        occurredOn: randomDateWithinHistory(),
        method: pick(METHODS),
        donorHouseholdId: tiedToHousehold ? pick(householdIds) : null,
        donorName: anonymous ? null : `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        anonymous,
        receiptNo: null, note: null, adjustsId: null, adjustmentReason: null,
      },
    };
  });

  for (let i = 0; i < donationMutations.length; i += BATCH_SIZE) {
    await pushBatch(api, mosqueId, token, donationMutations.slice(i, i + BATCH_SIZE));
    console.log(`  donations ${Math.min(i + BATCH_SIZE, donationMutations.length)}/${DONATION_COUNT}`);
  }

  await app.shutdown();
  await app.pool.close();

  console.log('\nSeed complete.');
  console.log(`  mosqueId: ${mosqueId}`);
  console.log(`  admin login: ${email} / ${password}`);
  console.log(`  households: ${HOUSEHOLD_COUNT}, donations: ${DONATION_COUNT}, history: ${HISTORY_MONTHS} months`);
}

main().catch((error: unknown) => {
  console.error('Seed script failed:', error);
  process.exit(1);
});
