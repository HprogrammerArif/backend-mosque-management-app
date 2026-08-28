import { z } from 'zod';
import { STAFF_STATUSES, PAYROLL_RUN_STATUSES } from '../../domain/enums.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const period = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM');

export const createStaffSchema = z.object({
  name: z.string().min(1).max(200),
  roleTitle: z.string().max(100).nullable().default(null),
  phone: z.string().max(20).nullable().default(null),
  monthlySalaryMinor: z.number().int().min(0).default(0),
  currency: z.enum(['BDT', 'USD', 'GBP', 'EUR']).default('BDT'),
  joinedOn: isoDate.nullable().default(null),
}).strip();

export const staffResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleTitle: z.string().nullable(),
  phone: z.string().nullable(),
  monthlySalaryMinor: z.number().int(),
  currency: z.string(),
  status: z.enum(STAFF_STATUSES),
  joinedOn: z.string().nullable(),
});

export const createPayrollRunSchema = z.object({
  period,
  fundId: z.string().min(1),
}).strip();

export const payrollRunResponseSchema = z.object({
  id: z.string(),
  period: z.string(),
  fundId: z.string(),
  status: z.enum(PAYROLL_RUN_STATUSES),
  postedAt: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

export const payrollLineResponseSchema = z.object({
  id: z.string(),
  runId: z.string(),
  staffId: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  expenseId: z.string().nullable(),
});

export type CreateStaffRequest = z.infer<typeof createStaffSchema>;
export type CreatePayrollRunRequest = z.infer<typeof createPayrollRunSchema>;
