/**
 * Comprehensive, organized seed script for the Masjid OS ecosystem.
 *
 * Provides realistic, clean seed data for:
 * 1. Fixed, predictable credentials for all roles (Admin, Treasurer, Committee, Staff, Member)
 * 2. PRO plan mosque tenant with proper Bangladesh coordinates & timezone
 * 3. Prayer timetable config (Karachi calculation method, fixed Iqamahs)
 * 4. 25 realistic Bangladeshi households & family members (individuals)
 * 5. Offline sync changelog generation for mobile SQLite via /sync/push
 * 6. Multi-month dues generation, full & partial payments, waived charges
 * 7. Diversified donations across General, Zakat, Sadaqah, Building funds
 * 8. 5 Staff members and multi-month payroll runs (POSTED with ledger lines + DRAFT)
 * 9. Realistic expenses including utilities, maintenance, supplies, and Shariah-compliant Zakat distribution
 * 10. Committee roster (8 executive members)
 * 11. Upcoming and recurring community events
 * 12. Community announcements (urgent and normal)
 *
 * Run: pnpm seed  OR  pnpm seed:realistic
 */
import { uuidv7 } from 'uuidv7';
import request from 'supertest';
import { serializeHlc, type Hlc } from '../src/domain/hlc.js';
import { resetAllTables } from '../test/helpers/reset-all-tables.js';

export const SEED_CREDENTIALS = [
  {
    role: 'ADMIN',
    email: 'admin@masjid.com',
    phone: '+8801711000001',
    password: 'Password123!',
    displayName: 'Haji Mohammad Abdul Karim',
    description: 'Mosque President / Lead Administrator',
  },
  {
    role: 'TREASURER',
    email: 'treasurer@masjid.com',
    phone: '+8801711000002',
    password: 'Password123!',
    displayName: 'Tariqul Islam Chowdhury',
    description: 'Finance Secretary / Mosque Treasurer',
  },
  {
    role: 'COMMITTEE',
    email: 'committee@masjid.com',
    phone: '+8801711000003',
    password: 'Password123!',
    displayName: 'Engr. Rafiqul Hasan',
    description: 'Executive Committee Member',
  },
  {
    role: 'STAFF',
    email: 'imam@masjid.com',
    phone: '+8801711000004',
    password: 'Password123!',
    displayName: 'Mufti Abdullah Al-Mansur',
    description: 'Senior Imam & Khatib',
  },
  {
    role: 'MEMBER',
    email: 'member@masjid.com',
    phone: '+8801711000005',
    password: 'Password123!',
    displayName: 'Dr. Mahfuzur Rahman',
    description: 'General Community Member (Musalli)',
  },
] as const;

let hlcCounter = 0;
function nextHlc(): string {
  hlcCounter += 1;
  const clock: Hlc = { wall: Date.now() + hlcCounter, counter: 0, node: 'seed-script' };
  return serializeHlc(clock);
}

function getDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function getPeriod(offsetMonths = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function pushBatch(
  api: ReturnType<typeof request>, mosqueId: string, token: string, mutations: unknown[],
): Promise<void> {
  const res = await api.post('/api/v1/sync/push')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-Id', mosqueId)
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
  console.log('\n======================================================');
  console.log('   MASJID OS: INITIALIZING ORGANIZED SEED DATA');
  console.log('======================================================\n');

  const { createApp } = await import('../src/main.js');
  const app = await createApp();
  const api = request(app.server);

  console.log('1. Resetting database to a clean, fresh state...');
  await resetAllTables(app.pool);

  console.log('2. Creating standard system user accounts...');
  const registeredUsers: Record<string, { id: string; token: string }> = {};

  for (const cred of SEED_CREDENTIALS) {
    const reg = await api.post('/api/v1/auth/register').send({
      email: cred.email,
      phone: cred.phone,
      password: cred.password,
      displayName: cred.displayName,
      locale: 'en',
    });
    if (reg.status !== 201) {
      throw new Error(`Failed to register ${cred.email}: ${reg.status} ${JSON.stringify(reg.body)}`);
    }
    registeredUsers[cred.role] = {
      id: reg.body.user.id as string,
      token: reg.body.accessToken as string,
    };
  }

  const adminToken = registeredUsers['ADMIN']!.token;
  const adminUserId = registeredUsers['ADMIN']!.id;

  console.log('3. Provisioning Central Mosque (Baitul Falah Central Jame Masjid)...');
  const mosqueRes = await api.post('/api/v1/mosques')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Idempotency-Key', uuidv7())
    .send({
      name: 'Baitul Falah Central Jame Masjid',
      timezone: 'Asia/Dhaka',
      latitude: 23.8103,
      longitude: 90.4125,
    });
  if (mosqueRes.status !== 201) {
    throw new Error(`Mosque creation failed: ${mosqueRes.status} ${JSON.stringify(mosqueRes.body)}`);
  }
  const mosqueId = mosqueRes.body.id as string;

  console.log('4. Assigning user roles to mosque membership...');
  for (const cred of SEED_CREDENTIALS) {
    if (cred.role === 'ADMIN') continue; // Admin membership is created automatically on mosque creation
    const userId = registeredUsers[cred.role]!.id;
    await app.pool.execute(
      'INSERT INTO MEMBERSHIPS (ID, MOSQUE_ID, USER_ID, ROLE, STATUS) VALUES (:id, :mosqueId, :userId, :role, :status)',
      { id: uuidv7(), mosqueId, userId, role: cred.role, status: 'ACTIVE' },
    );
  }

  console.log('5. Upgrading mosque subscription to PRO plan (Payroll & Analytics enabled)...');
  await api.post(`/api/v1/mosques/${mosqueId}/billing/mock-set-plan`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Tenant-Id', mosqueId)
    .set('Idempotency-Key', uuidv7())
    .send({ planCode: 'PRO' });

  console.log('6. Configuring Prayer & Jamaat Timetable...');
  await api.put(`/api/v1/mosques/${mosqueId}/prayer-config`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Tenant-Id', mosqueId)
    .set('Idempotency-Key', uuidv7())
    .send({
      calculationMethod: 'KARACHI',
      fajrOffsetMin: 0,
      dhuhrOffsetMin: 0,
      asrOffsetMin: 0,
      maghribOffsetMin: 3,
      ishaOffsetMin: 0,
      fajrFixedTime: '05:15',
      dhuhrFixedTime: '13:30',
      asrFixedTime: '16:45',
      maghribFixedTime: null,
      ishaFixedTime: '20:00',
      jumuahTime: '13:30',
    });

  // Query seeded funds and expense categories
  const fundsRes = await api.get(`/api/v1/mosques/${mosqueId}/funds`)
    .set('Authorization', `Bearer ${adminToken}`);
  const funds = fundsRes.body as { id: string; name: string; type: string; zakatEligible: boolean }[];
  const generalFund = funds.find((f) => f.type === 'GENERAL')!;
  const zakatFund = funds.find((f) => f.type === 'ZAKAT')!;
  const sadaqahFund = funds.find((f) => f.type === 'SADAQAH')!;
  const buildingFund = funds.find((f) => f.type === 'BUILDING')!;

  const catsRes = await api.get(`/api/v1/mosques/${mosqueId}/expense-categories`)
    .set('Authorization', `Bearer ${adminToken}`);
  const cats = catsRes.body as { id: string; name: string; zakatEligible: boolean }[];
  const utilitiesCat = cats.find((c) => c.name === 'Utilities')!;
  const maintenanceCat = cats.find((c) => c.name === 'Maintenance')!;
  const generalCat = cats.find((c) => c.name === 'General Expenses')!;
  const zakatCat = cats.find((c) => c.name === 'Zakat Distribution')!;

  console.log('7. Seeding Executive Committee Members (2025–2026)...');
  const committeeRoster = [
    { name: 'Haji Mohammad Abdul Karim', position: 'President', phone: '+8801711000001', termStart: '2025-01-01', termEnd: '2026-12-31' },
    { name: 'Alhaj Shamsul Alam', position: 'Senior Vice President', phone: '+8801711000011', termStart: '2025-01-01', termEnd: '2026-12-31' },
    { name: 'Advocate Nurul Islam', position: 'General Secretary', phone: '+8801711000012', termStart: '2025-01-01', termEnd: '2026-12-31' },
    { name: 'Dr. Mahbubur Rahman', position: 'Joint Secretary', phone: '+8801711000013', termStart: '2025-01-01', termEnd: '2026-12-31' },
    { name: 'Tariqul Islam Chowdhury', position: 'Treasurer', phone: '+8801711000002', termStart: '2025-01-01', termEnd: '2026-12-31' },
    { name: 'Engr. Rafiqul Hasan', position: 'Organizing Secretary', phone: '+8801711000003', termStart: '2025-01-01', termEnd: '2026-12-31' },
    { name: 'Alhaj Kamal Uddin', position: 'Executive Member', phone: '+8801711000014', termStart: '2025-01-01', termEnd: '2026-12-31' },
    { name: 'Prof. Nasir Ahmed', position: 'Executive Member', phone: '+8801711000015', termStart: '2025-01-01', termEnd: '2026-12-31' },
  ];
  for (const cm of committeeRoster) {
    await api.post(`/api/v1/mosques/${mosqueId}/committee`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', mosqueId)
      .set('Idempotency-Key', uuidv7())
      .send(cm);
  }

  console.log('8. Seeding Mosque Staff Roster...');
  const staffMembers = [
    { name: 'Mufti Abdullah Al-Mansur', roleTitle: 'Khatib & Senior Imam', phone: '+8801711000004', monthlySalaryMinor: 3500000, joinedOn: '2023-01-01' },
    { name: 'Hafez Maulana Zubair Ahmed', roleTitle: 'Second Imam', phone: '+8801711000021', monthlySalaryMinor: 2200000, joinedOn: '2023-06-01' },
    { name: 'Qari Nurul Huda', roleTitle: 'Senior Muazzin', phone: '+8801711000022', monthlySalaryMinor: 1800000, joinedOn: '2022-03-01' },
    { name: 'Md. Delwar Hossain', roleTitle: 'Chief Caretaker (Khadem)', phone: '+8801711000023', monthlySalaryMinor: 1400000, joinedOn: '2021-08-01' },
    { name: 'Md. Rashed Mia', roleTitle: 'Assistant Khadem & Cleaner', phone: '+8801711000024', monthlySalaryMinor: 1200000, joinedOn: '2024-02-01' },
  ];
  for (const s of staffMembers) {
    await api.post(`/api/v1/mosques/${mosqueId}/staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', mosqueId)
      .set('Idempotency-Key', uuidv7())
      .send(s);
  }

  console.log('9. Seeding 25 Realistic Community Households & Family Members (sync push enabled)...');
  const RAW_HOUSEHOLDS = [
    { name: 'Mohammad Abdul Karim Household', area: 'Sector 3', address: 'House 12, Road 4, Sector 3, Uttara', phone: '+8801819000001', dues: 150000, head: 'Haji Mohammad Abdul Karim', spouse: 'Sultana Begum', child: 'Mustafizur Rahman', parent: 'Mohammad Ebrahim' },
    { name: 'Tariqul Islam Chowdhury Household', area: 'Dhanmondi', address: 'Flat 4A, Road 8, Dhanmondi', phone: '+8801819000002', dues: 200000, head: 'Tariqul Islam Chowdhury', spouse: 'Nasreen Akhter', child: 'Tanvir Chowdhury', parent: null },
    { name: 'Engr. Rafiqul Hasan Household', area: 'Mirpur-10', address: 'Plot 45, Block C, Mirpur-10', phone: '+8801819000003', dues: 100000, head: 'Engr. Rafiqul Hasan', spouse: 'Farzana Parvin', child: 'Rafi Hasan', parent: null },
    { name: 'Dr. Mahfuzur Rahman Household', area: 'Banani', address: 'House 34, Road 11, Banani', phone: '+8801819000004', dues: 200000, head: 'Dr. Mahfuzur Rahman', spouse: 'Dr. Shaheen Sultana', child: 'Faheem Rahman', parent: 'Alhaj Mofizur Rahman' },
    { name: 'Alhaj Shamsul Alam Household', area: 'Sector 5', address: 'House 18, Road 2, Sector 5, Uttara', phone: '+8801819000005', dues: 150000, head: 'Alhaj Shamsul Alam', spouse: 'Rokeya Begum', child: 'Shamsul Arefin', parent: null },
    { name: 'Advocate Nurul Islam Household', area: 'Dhanmondi', address: 'House 8, Road 27, Dhanmondi', phone: '+8801819000006', dues: 150000, head: 'Advocate Nurul Islam', spouse: 'Tahmina Islam', child: 'Nafis Islam', parent: null },
    { name: 'Alhaj Kamal Uddin Household', area: 'Gulshan-1', address: 'Flat 3B, Road 19, Gulshan-1', phone: '+8801819000007', dues: 200000, head: 'Alhaj Kamal Uddin', spouse: 'Saleha Khatun', child: 'Kamran Uddin', parent: null },
    { name: 'Prof. Nasir Ahmed Household', area: 'Mohammadpur', address: 'House 22, Iqbal Road, Mohammadpur', phone: '+8801819000008', dues: 100000, head: 'Prof. Nasir Ahmed', spouse: 'Rehana Ahmed', child: 'Nabeel Ahmed', parent: null },
    { name: 'Dr. Mahbubur Rahman Household', area: 'Banani', address: 'House 56, Road 6, Banani', phone: '+8801819000009', dues: 150000, head: 'Dr. Mahbubur Rahman', spouse: 'Ruma Rahman', child: 'Zubair Rahman', parent: null },
    { name: 'Kazi Faruk Ahmed Household', area: 'Sector 7', address: 'House 9, Road 14, Sector 7, Uttara', phone: '+8801819000010', dues: 100000, head: 'Kazi Faruk Ahmed', spouse: 'Nazma Ahmed', child: 'Kazi Adnan', parent: null },
    { name: 'Aminul Haque Mollah Household', area: 'Mirpur-2', address: 'House 15, Block D, Mirpur-2', phone: '+8801819000011', dues: 80000, head: 'Aminul Haque Mollah', spouse: 'Morium Begum', child: 'Mahir Mollah', parent: null },
    { name: 'Zahirul Talukder Household', area: 'Badda', address: 'House 78, DIT Project, Badda', phone: '+8801819000012', dues: 100000, head: 'Zahirul Talukder', spouse: 'Shirin Talukder', child: 'Talha Talukder', parent: null },
    { name: 'Mizanur Rahman Sarkar Household', area: 'Khilgaon', address: 'House 31, Block A, Khilgaon', phone: '+8801819000013', dues: 100000, head: 'Mizanur Rahman Sarkar', spouse: 'Hasna Hena', child: 'Saifur Sarkar', parent: null },
    { name: 'Shahidul Islam Bhuiyan Household', area: 'Sector 4', address: 'House 24, Road 8, Sector 4, Uttara', phone: '+8801819000014', dues: 150000, head: 'Shahidul Islam Bhuiyan', spouse: 'Khadija Akhter', child: 'Siam Bhuiyan', parent: null },
    { name: 'Golam Kibria Mondol Household', area: 'Mohammadpur', address: 'House 11, Salimullah Road, Mohammadpur', phone: '+8801819000015', dues: 100000, head: 'Golam Kibria Mondol', spouse: 'Shahida Mondol', child: 'Kawsar Mondol', parent: null },
    { name: 'Anwar Hossain Miah Household', area: 'Gulshan-2', address: 'House 67, Road 71, Gulshan-2', phone: '+8801819000016', dues: 200000, head: 'Anwar Hossain Miah', spouse: 'Dilruba Miah', child: 'Arman Miah', parent: null },
    { name: 'Jamal Uddin Siddique Household', area: 'Sector 9', address: 'House 42, Road 3, Sector 9, Uttara', phone: '+8801819000017', dues: 120000, head: 'Jamal Uddin Siddique', spouse: 'Parvin Siddique', child: 'Jawad Siddique', parent: null },
    { name: 'Kabir Ahmed Mazumder Household', area: 'Dhanmondi', address: 'Flat 5B, Road 12, Dhanmondi', phone: '+8801819000018', dues: 150000, head: 'Kabir Ahmed Mazumder', spouse: 'Laila Mazumder', child: 'Aayan Mazumder', parent: null },
    { name: 'Habibur Rahman Sheikh Household', area: 'Mirpur-1', address: 'House 61, Block A, Mirpur-1', phone: '+8801819000019', dues: 80000, head: 'Habibur Rahman Sheikh', spouse: 'Amena Sheikh', child: 'Hasan Sheikh', parent: null },
    { name: 'Fazlul Haque Khan Household', area: 'Mohammadpur', address: 'House 35, Tajmahal Road, Mohammadpur', phone: '+8801819000020', dues: 100000, head: 'Fazlul Haque Khan', spouse: 'Monowara Khan', child: 'Fahim Khan', parent: null },
    { name: 'Badiul Alam Zaman Household', area: 'Khilgaon', address: 'House 89, Chowrasta, Khilgaon', phone: '+8801819000021', dues: 80000, head: 'Badiul Alam Zaman', spouse: 'Sabiha Zaman', child: 'Riyad Zaman', parent: null },
    { name: 'Abdul Jalil Faruk Household', area: 'Badda', address: 'House 14, LINK Road, Badda', phone: '+8801819000022', dues: 100000, head: 'Abdul Jalil Faruk', spouse: 'Afroza Faruk', child: 'Jubayer Faruk', parent: null },
    // 3 Needy / Exempt Households (0 dues, exempt: true)
    { name: 'Nasir Uddin Household (Exempt)', area: 'Mirpur', address: 'Mirpur Slum Area, Section 11', phone: '+8801819000023', dues: 0, head: 'Md. Nasir Uddin', spouse: 'Rahima Khatun', child: 'Sumon Mia', parent: null, exempt: true },
    { name: 'Delwar Mia Household (Exempt)', area: 'Mohammadpur', address: 'Rayer Bazar Embankment', phone: '+8801819000024', dues: 0, head: 'Md. Delwar Mia', spouse: 'Momena Begum', child: 'Sujon Mia', parent: null, exempt: true },
    { name: 'Rashed Ali Household (Exempt)', area: 'Uttara', address: 'Baunia Bandh Area, Sector 18', phone: '+8801819000025', dues: 0, head: 'Md. Rashed Ali', spouse: 'Fatema Khatun', child: 'Rubel Ali', parent: null, exempt: true },
  ];

  const householdIds: string[] = [];
  const householdMutations = RAW_HOUSEHOLDS.map((h) => {
    const id = uuidv7();
    householdIds.push(id);
    return {
      mutationId: uuidv7(),
      entity: 'households' as const,
      entityId: id,
      op: 'insert' as const,
      hlc: nextHlc(),
      dependsOn: [],
      payload: {
        name: h.name,
        addressLine1: h.address,
        area: h.area,
        phone: h.phone,
        monthlyDuesMinor: h.dues,
        exempt: h.exempt ?? false,
        joinedOn: getDateStr(-365),
      },
    };
  });

  await pushBatch(api, mosqueId, adminToken, householdMutations);

  // Insert Individuals (family members) and connect Head of Household
  console.log('10. Linking family members (individuals) to households...');
  for (let i = 0; i < RAW_HOUSEHOLDS.length; i++) {
    const h = RAW_HOUSEHOLDS[i]!;
    const householdId = householdIds[i]!;

    // Head
    const headId = uuidv7();
    await app.pool.executeAsTenant(mosqueId,
      `INSERT INTO INDIVIDUALS (ID, TENANT_ID, HOUSEHOLD_ID, USER_ID, FULL_NAME, RELATION, PHONE, DATE_OF_BIRTH, GENDER, CREATED_BY)
       VALUES (:id, :tenantId, :householdId, NULL, :fullName, 'HEAD', :phone, TO_DATE('1975-04-12','YYYY-MM-DD'), 'MALE', :createdBy)`,
      { id: headId, tenantId: mosqueId, householdId, fullName: h.head, phone: h.phone, createdBy: adminUserId },
    );

    // Set HEAD_INDIVIDUAL_ID on Household
    await app.pool.executeAsTenant(mosqueId,
      'UPDATE HOUSEHOLDS SET HEAD_INDIVIDUAL_ID = :headId WHERE ID = :householdId',
      { headId, householdId },
    );

    // Spouse
    if (h.spouse) {
      await app.pool.executeAsTenant(mosqueId,
        `INSERT INTO INDIVIDUALS (ID, TENANT_ID, HOUSEHOLD_ID, USER_ID, FULL_NAME, RELATION, PHONE, DATE_OF_BIRTH, GENDER, CREATED_BY)
         VALUES (:id, :tenantId, :householdId, NULL, :fullName, 'SPOUSE', NULL, TO_DATE('1980-08-20','YYYY-MM-DD'), 'FEMALE', :createdBy)`,
        { id: uuidv7(), tenantId: mosqueId, householdId, fullName: h.spouse, createdBy: adminUserId },
      );
    }

    // Child
    if (h.child) {
      await app.pool.executeAsTenant(mosqueId,
        `INSERT INTO INDIVIDUALS (ID, TENANT_ID, HOUSEHOLD_ID, USER_ID, FULL_NAME, RELATION, PHONE, DATE_OF_BIRTH, GENDER, CREATED_BY)
         VALUES (:id, :tenantId, :householdId, NULL, :fullName, 'CHILD', NULL, TO_DATE('2005-11-15','YYYY-MM-DD'), 'MALE', :createdBy)`,
        { id: uuidv7(), tenantId: mosqueId, householdId, fullName: h.child, createdBy: adminUserId },
      );
    }

    // Parent
    if (h.parent) {
      await app.pool.executeAsTenant(mosqueId,
        `INSERT INTO INDIVIDUALS (ID, TENANT_ID, HOUSEHOLD_ID, USER_ID, FULL_NAME, RELATION, PHONE, DATE_OF_BIRTH, GENDER, CREATED_BY)
         VALUES (:id, :tenantId, :householdId, NULL, :fullName, 'PARENT', NULL, TO_DATE('1950-02-10','YYYY-MM-DD'), 'MALE', :createdBy)`,
        { id: uuidv7(), tenantId: mosqueId, householdId, fullName: h.parent, createdBy: adminUserId },
      );
    }
  }

  console.log('11. Seeding Multi-Month Donations (push sync enabled)...');
  const donationMutations: unknown[] = [];

  // Friday Jumuah collections (Weekly for past 8 Fridays)
  for (let w = 8; w >= 1; w--) {
    const occurredOn = getDateStr(-w * 7);
    donationMutations.push({
      mutationId: uuidv7(),
      entity: 'donations' as const,
      entityId: uuidv7(),
      op: 'insert' as const,
      hlc: nextHlc(),
      dependsOn: [],
      payload: {
        fundId: generalFund.id,
        amountMinor: 3250000, // 32,500 BDT
        currency: 'BDT',
        occurredOn,
        method: 'CASH',
        donorHouseholdId: null,
        donorName: `Friday Jumuah Box 1 (${occurredOn})`,
        anonymous: true,
        receiptNo: `JUM-B1-${w}`,
        note: 'Main hall collection box',
      },
    });
    donationMutations.push({
      mutationId: uuidv7(),
      entity: 'donations' as const,
      entityId: uuidv7(),
      op: 'insert' as const,
      hlc: nextHlc(),
      dependsOn: [],
      payload: {
        fundId: generalFund.id,
        amountMinor: 1850000, // 18,500 BDT
        currency: 'BDT',
        occurredOn,
        method: 'CASH',
        donorHouseholdId: null,
        donorName: `Friday Jumuah Box 2 (${occurredOn})`,
        anonymous: true,
        receiptNo: `JUM-B2-${w}`,
        note: 'Balcony collection box',
      },
    });
  }

  // Zakat contributions from affluent community members
  const zakatDonors = [
    { name: 'Haji Mohammad Abdul Karim', householdId: householdIds[0], amount: 15000000 }, // 150,000 BDT
    { name: 'Tariqul Islam Chowdhury', householdId: householdIds[1], amount: 10000000 },   // 100,000 BDT
    { name: 'Dr. Mahfuzur Rahman', householdId: householdIds[3], amount: 8000000 },        // 80,000 BDT
    { name: 'Alhaj Kamal Uddin', householdId: householdIds[6], amount: 12000000 },         // 120,000 BDT
    { name: 'Anwar Hossain Miah', householdId: householdIds[15], amount: 9000000 },        // 90,000 BDT
  ];
  for (const z of zakatDonors) {
    donationMutations.push({
      mutationId: uuidv7(),
      entity: 'donations' as const,
      entityId: uuidv7(),
      op: 'insert' as const,
      hlc: nextHlc(),
      dependsOn: [],
      payload: {
        fundId: zakatFund.id,
        amountMinor: z.amount,
        currency: 'BDT',
        occurredOn: getDateStr(-25),
        method: 'BANK',
        donorHouseholdId: z.householdId,
        donorName: z.name,
        anonymous: false,
        receiptNo: null,
        note: 'Annual Zakat disbursement contribution',
      },
    });
  }

  // Sadaqah Contributions
  for (let s = 1; s <= 12; s++) {
    donationMutations.push({
      mutationId: uuidv7(),
      entity: 'donations' as const,
      entityId: uuidv7(),
      op: 'insert' as const,
      hlc: nextHlc(),
      dependsOn: [],
      payload: {
        fundId: sadaqahFund.id,
        amountMinor: (s * 500) * 100, // 500 - 6,000 BDT
        currency: 'BDT',
        occurredOn: getDateStr(-s * 5),
        method: s % 2 === 0 ? 'MOBILE_MONEY' : 'CASH',
        donorHouseholdId: householdIds[s % householdIds.length],
        donorName: `Sadaqah Donor #${s}`,
        anonymous: s > 6,
        receiptNo: null,
        note: 'Voluntary Sadaqah donation',
      },
    });
  }

  // Building & Expansion Fund Donations
  const buildingDonations = [
    { name: 'Alhaj Shamsul Alam', householdId: householdIds[4], amount: 5000000 },
    { name: 'Advocate Nurul Islam', householdId: householdIds[5], amount: 4000000 },
    { name: 'Engr. Rafiqul Hasan', householdId: householdIds[2], amount: 3000000 },
    { name: 'Prof. Nasir Ahmed', householdId: householdIds[7], amount: 2500000 },
  ];
  for (const b of buildingDonations) {
    donationMutations.push({
      mutationId: uuidv7(),
      entity: 'donations' as const,
      entityId: uuidv7(),
      op: 'insert' as const,
      hlc: nextHlc(),
      dependsOn: [],
      payload: {
        fundId: buildingFund.id,
        amountMinor: b.amount,
        currency: 'BDT',
        occurredOn: getDateStr(-40),
        method: 'BANK',
        donorHouseholdId: b.householdId,
        donorName: b.name,
        anonymous: false,
        receiptNo: null,
        note: '2nd floor expansion pledge',
      },
    });
  }

  await pushBatch(api, mosqueId, adminToken, donationMutations);

  console.log('12. Generating and Settling Multi-Month Dues...');
  // Generate dues for previous 2 months and current month
  const periods = [getPeriod(-2), getPeriod(-1), getPeriod(0)];
  for (let pIdx = 0; pIdx < periods.length; pIdx++) {
    const period = periods[pIdx];
    const genRes = await api.post(`/api/v1/mosques/${mosqueId}/dues/generate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', mosqueId)
      .set('Idempotency-Key', uuidv7())
      .send({ period });

    const charges = (genRes.body ?? []) as { id: string; householdId: string; amountMinor: number }[];

    // Record payments
    for (let cIdx = 0; cIdx < charges.length; cIdx++) {
      const charge = charges[cIdx]!;
      // Period -2: pay 100% of charges
      if (pIdx === 0) {
        await api.post(`/api/v1/mosques/${mosqueId}/dues/charges/${charge.id}/payments`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Tenant-Id', mosqueId)
          .set('Idempotency-Key', uuidv7())
          .send({
            fundId: generalFund.id,
            amountMinor: charge.amountMinor,
            currency: 'BDT',
            paidOn: getDateStr(-60 + cIdx),
            method: cIdx % 2 === 0 ? 'CASH' : 'MOBILE_MONEY',
          });
      }
      // Period -1: pay 70% full, 15% partial, rest pending
      else if (pIdx === 1) {
        if (cIdx < Math.floor(charges.length * 0.7)) {
          await api.post(`/api/v1/mosques/${mosqueId}/dues/charges/${charge.id}/payments`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('X-Tenant-Id', mosqueId)
            .set('Idempotency-Key', uuidv7())
            .send({
              fundId: generalFund.id,
              amountMinor: charge.amountMinor,
              currency: 'BDT',
              paidOn: getDateStr(-30 + cIdx),
              method: 'CASH',
            });
        } else if (cIdx < Math.floor(charges.length * 0.85)) {
          await api.post(`/api/v1/mosques/${mosqueId}/dues/charges/${charge.id}/payments`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('X-Tenant-Id', mosqueId)
            .set('Idempotency-Key', uuidv7())
            .send({
              fundId: generalFund.id,
              amountMinor: Math.floor(charge.amountMinor / 2),
              currency: 'BDT',
              paidOn: getDateStr(-25),
              method: 'MOBILE_MONEY',
            });
        }
      }
      // Current Period: pay 30% full, 20% partial, 1 waive
      else {
        if (cIdx === 0) {
          // Waive 1 charge for hardship
          await api.post(`/api/v1/mosques/${mosqueId}/dues/charges/${charge.id}/waive`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('X-Tenant-Id', mosqueId)
            .set('Idempotency-Key', uuidv7())
            .send({ reason: 'Family medical emergency hardship waiver granted by committee' });
        } else if (cIdx < 8) {
          await api.post(`/api/v1/mosques/${mosqueId}/dues/charges/${charge.id}/payments`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('X-Tenant-Id', mosqueId)
            .set('Idempotency-Key', uuidv7())
            .send({
              fundId: generalFund.id,
              amountMinor: charge.amountMinor,
              currency: 'BDT',
              paidOn: getDateStr(-3),
              method: 'MOBILE_MONEY',
            });
        }
      }
    }
  }

  console.log('13. Creating and Posting Payroll Runs...');
  // Previous month payroll: POSTED (records salary expenses in ledger)
  const prevPayrollRes = await api.post(`/api/v1/mosques/${mosqueId}/payroll/runs`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Tenant-Id', mosqueId)
    .set('Idempotency-Key', uuidv7())
    .send({ period: getPeriod(-1), fundId: generalFund.id });

  if (prevPayrollRes.status === 201) {
    const runId = prevPayrollRes.body.id as string;
    await api.post(`/api/v1/mosques/${mosqueId}/payroll/runs/${runId}/post`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', mosqueId)
      .set('Idempotency-Key', uuidv7())
      .send({});
  }

  // Current month payroll: DRAFT
  await api.post(`/api/v1/mosques/${mosqueId}/payroll/runs`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Tenant-Id', mosqueId)
    .set('Idempotency-Key', uuidv7())
    .send({ period: getPeriod(0), fundId: generalFund.id });

  console.log('14. Seeding Operational Expenses & Shariah Zakat Distribution...');
  const expensesToSeed = [
    // Utilities
    { fundId: generalFund.id, categoryId: utilitiesCat.id, amountMinor: 4200000, occurredOn: getDateStr(-15), payee: 'DESCO (Dhaka Electric Supply Company)', description: 'Electricity bill for Main Prayer Hall Air Conditioning', method: 'BANK' },
    { fundId: generalFund.id, categoryId: utilitiesCat.id, amountMinor: 850000, occurredOn: getDateStr(-12), payee: 'Dhaka WASA', description: 'Water supply bill for ablution & washroom facilities', method: 'BANK' },
    { fundId: generalFund.id, categoryId: utilitiesCat.id, amountMinor: 180000, occurredOn: getDateStr(-10), payee: 'Amber IT Ltd.', description: 'High-speed broadband internet for CCTV surveillance', method: 'MOBILE_MONEY' },
    // Maintenance
    { fundId: generalFund.id, categoryId: maintenanceCat.id, amountMinor: 650000, occurredOn: getDateStr(-20), payee: 'Acoustic Sound Care', description: 'Amplifier capacitor repair & wireless mic replacement', method: 'CASH' },
    { fundId: generalFund.id, categoryId: maintenanceCat.id, amountMinor: 1200000, occurredOn: getDateStr(-18), payee: 'CleanTech Services', description: 'Main prayer hall carpet dry wash and sanitization', method: 'BANK' },
    { fundId: generalFund.id, categoryId: maintenanceCat.id, amountMinor: 420000, occurredOn: getDateStr(-8), payee: 'Aqua Water Filter Co.', description: 'Replacement of water purification filters in wudu area', method: 'CASH' },
    // General Expenses
    { fundId: generalFund.id, categoryId: generalCat.id, amountMinor: 350000, occurredOn: getDateStr(-5), payee: 'M/S Bismillah Sweets', description: 'Friday Jumuah refreshments for musallis & guests', method: 'CASH' },
    { fundId: generalFund.id, categoryId: generalCat.id, amountMinor: 480000, occurredOn: getDateStr(-4), payee: 'Al-Madina General Store', description: 'Janitorial supplies, phenyl, handwash, trash bags', method: 'CASH' },
    // Shariah Zakat Distribution (BR-1 compliant: Zakat fund + Zakat Distribution category)
    { fundId: zakatFund.id, categoryId: zakatCat.id, amountMinor: 2500000, occurredOn: getDateStr(-14), payee: '5 Needy Madrasa Orphan Students', description: 'Educational stipends and text books for orphan students', method: 'CASH' },
    { fundId: zakatFund.id, categoryId: zakatCat.id, amountMinor: 2000000, occurredOn: getDateStr(-9), payee: 'Md. Nazrul Islam (Hospital Patient)', description: 'Emergency heart surgery medical assistance grant', method: 'BANK' },
    { fundId: zakatFund.id, categoryId: zakatCat.id, amountMinor: 1800000, occurredOn: getDateStr(-2), payee: '3 Destitute Neighborhood Families', description: 'Monthly food ration package assistance (rice, lentils, oil)', method: 'CASH' },
  ];

  for (const exp of expensesToSeed) {
    await api.post(`/api/v1/mosques/${mosqueId}/expenses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', mosqueId)
      .set('Idempotency-Key', uuidv7())
      .send(exp);
  }

  console.log('15. Seeding Community Events...');
  const events = [
    {
      title: 'Weekly Tafseer-ul-Quran Majlis',
      description: 'Detailed explanation of Surah Al-Kahf with Maulana Mufti Abdullah Al-Mansur. All musallis are invited.',
      startsAt: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 24 * 3600 * 1000 + 5400 * 1000).toISOString(),
      location: 'Main Prayer Hall (Ground Floor)',
    },
    {
      title: 'Youth Tajweed & Qirat Workshop',
      description: 'Basic Tajweed rules and beautiful recitation practice for youth aged 12 to 25 with Qari Nurul Huda.',
      startsAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 5 * 24 * 3600 * 1000 + 7200 * 1000).toISOString(),
      location: 'Mosque Library & Seminar Hall',
    },
    {
      title: 'Community Iftar & Dua Mahfil',
      description: 'Annual gathering for musallis, neighborhood families, and community elders.',
      startsAt: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 12 * 24 * 3600 * 1000 + 7200 * 1000).toISOString(),
      location: 'Mosque Courtyard & Dining Area',
    },
    {
      title: 'Free Friday Medical & Blood Pressure Camp',
      description: 'Free basic health checkup, blood sugar, and blood pressure monitoring by volunteer doctors after Jumuah.',
      startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 10800 * 1000).toISOString(),
      location: 'Mosque Annex Room 1',
    },
    {
      title: 'Executive Committee Monthly General Meeting',
      description: 'Review of monthly accounts, ongoing maintenance works, and community outreach agenda.',
      startsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000 + 7200 * 1000).toISOString(),
      location: 'Committee Office (1st Floor)',
    },
  ];
  for (const ev of events) {
    await api.post(`/api/v1/mosques/${mosqueId}/events`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', mosqueId)
      .set('Idempotency-Key', uuidv7())
      .send(ev);
  }

  console.log('16. Seeding Community Announcements...');
  const announcements = [
    {
      title: 'Urgent Notice: Overhead Water Tank Cleaning on Tuesday',
      body: 'Please note that both overhead water tanks will undergo deep chemical cleaning and sanitization this Tuesday from 8:00 AM to 12:30 PM. Water supply for wudu will be temporarily unavailable during this period. We kindly request musallis to make wudu before coming.',
      urgent: true,
    },
    {
      title: 'Updated Iqamah Timings for Spring / Summer Season',
      body: 'The mosque committee in consultation with the Khatib has revised the Iqamah schedule effective from 1st of next month: Fajr 05:15 AM, Dhuhr 01:30 PM, Asr 04:45 PM, Maghrib +3 mins after Sunset, Isha 08:00 PM, Jumuah Khutbah 01:00 PM / Salat 01:30 PM.',
      urgent: false,
    },
    {
      title: 'Special Dua Mahfil for Deceased Community Members',
      body: 'A special collective Dua and Khatam-ul-Quran will take place this Thursday evening after Maghrib prayer for the late members and elders of our neighborhood. Everyone is requested to participate.',
      urgent: false,
    },
    {
      title: 'Mosque Reference Library Now Open Daily',
      body: 'The mosque reference library on the 2nd floor has been stocked with Tafseer, Hadith collections, and Islamic literature. Open daily between Asr and Isha for all musallis and students.',
      urgent: false,
    },
  ];
  for (const an of announcements) {
    await api.post(`/api/v1/mosques/${mosqueId}/announcements`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', mosqueId)
      .set('Idempotency-Key', uuidv7())
      .send(an);
  }

  await app.shutdown();
  await app.pool.close();

  console.log('\n========================================================================');
  console.log('                 SEED DATA INITIALIZED SUCCESSFULLY!                    ');
  console.log('========================================================================\n');
  console.log(`Mosque Name : Baitul Falah Central Jame Masjid`);
  console.log(`Mosque ID   : ${mosqueId}`);
  console.log(`Plan        : PRO (Entitlements: Online Donations, Payroll, Data Export)`);
  console.log(`Prayer Method: KARACHI (Fixed Iqamah: Fajr 05:15, Dhuhr 13:30, Asr 16:45, Isha 20:00)\n`);

  console.log('------------------------------------------------------------------------');
  console.log('                     PREDICTABLE LOGIN CREDENTIALS                      ');
  console.log('------------------------------------------------------------------------');
  console.log('All accounts share password: Password123!\n');
  for (const cred of SEED_CREDENTIALS) {
    console.log(`  [${cred.role.padEnd(9)}] ${cred.email.padEnd(23)} | Phone: ${cred.phone.padEnd(16)} | Name: ${cred.displayName}`);
    console.log(`               Role Description: ${cred.description}`);
  }
  console.log('------------------------------------------------------------------------\n');

  console.log('Summary of Seeded Data:');
  console.log(`  • Households           : ${RAW_HOUSEHOLDS.length} (22 regular + 3 exempt needy)`);
  console.log(`  • Family Individuals   : ~50 individuals linked to households`);
  console.log(`  • Donations            : ${donationMutations.length} records across General, Zakat, Sadaqah, Building`);
  console.log(`  • Dues Charges         : 3 months generated (${periods.join(', ')}), majority settled`);
  console.log(`  • Staff Members        : ${staffMembers.length} active employees`);
  console.log(`  • Payroll Runs         : 2 runs (1 POSTED with ledger expenses + 1 DRAFT)`);
  console.log(`  • Operating Expenses   : ${expensesToSeed.length} records (Utilities, Maintenance, Zakat distribution)`);
  console.log(`  • Committee Members    : ${committeeRoster.length} active executive members`);
  console.log(`  • Events               : ${events.length} community events`);
  console.log(`  • Announcements        : ${announcements.length} notices (1 urgent, 3 normal)\n`);
  console.log('You can now log in to the mobile app or web using any of the credentials above!');
  console.log('========================================================================\n');
}

main().catch((error: unknown) => {
  console.error('Seed script failed:', error);
  process.exit(1);
});
