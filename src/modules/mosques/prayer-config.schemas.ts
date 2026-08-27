import { z } from 'zod';

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const offsetMinutes = z.number().int().min(-120).max(120);

export const prayerConfigResponseSchema = z.object({
  tenantId: z.string(),
  calculationMethod: z.string(),
  fajrOffsetMin: offsetMinutes,
  dhuhrOffsetMin: offsetMinutes,
  asrOffsetMin: offsetMinutes,
  maghribOffsetMin: offsetMinutes,
  ishaOffsetMin: offsetMinutes,
  fajrFixedTime: timeOfDay.nullable(),
  dhuhrFixedTime: timeOfDay.nullable(),
  asrFixedTime: timeOfDay.nullable(),
  maghribFixedTime: timeOfDay.nullable(),
  ishaFixedTime: timeOfDay.nullable(),
  jumuahTime: timeOfDay.nullable(),
});

export const updatePrayerConfigSchema = z.object({
  calculationMethod: z.string().min(1).max(30),
  fajrOffsetMin: offsetMinutes.default(0),
  dhuhrOffsetMin: offsetMinutes.default(0),
  asrOffsetMin: offsetMinutes.default(0),
  maghribOffsetMin: offsetMinutes.default(0),
  ishaOffsetMin: offsetMinutes.default(0),
  fajrFixedTime: timeOfDay.nullable().default(null),
  dhuhrFixedTime: timeOfDay.nullable().default(null),
  asrFixedTime: timeOfDay.nullable().default(null),
  maghribFixedTime: timeOfDay.nullable().default(null),
  ishaFixedTime: timeOfDay.nullable().default(null),
  jumuahTime: timeOfDay.nullable().default(null),
}).strip();

export type UpdatePrayerConfigRequest = z.infer<typeof updatePrayerConfigSchema>;
