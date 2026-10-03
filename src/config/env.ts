import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DB_DIALECT: z.enum(['oracle', 'postgres']).default('oracle'),
    DATABASE_URL: z.string().optional(),
    POSTGRES_URL: z.string().optional(),

    ORACLE_USER: z.string().optional().default('masjid'),
    ORACLE_PASSWORD: z.string().optional().default('masjid'),
    ORACLE_CONNECT_STRING: z.string().optional().default('localhost:1521/FREEPDB1'),
    ORACLE_POOL_MIN: z.coerce.number().int().default(2),
    ORACLE_POOL_MAX: z.coerce.number().int().default(10),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.coerce.number().int().default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().default(30),

    APP_BASE_URL: z.string().url(),
  })
  .superRefine((data, ctx) => {
    const isPostgres = data.DB_DIALECT === 'postgres' || Boolean(data.DATABASE_URL || data.POSTGRES_URL);
    if (isPostgres && !data.DATABASE_URL && !data.POSTGRES_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL or POSTGRES_URL must be provided when DB_DIALECT is postgres',
        path: ['DATABASE_URL'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validated at startup so a misconfigured deploy dies immediately and loudly rather
 * than failing at first use. No secret has a default — a development fallback for
 * JWT_SECRET is exactly how a development secret reaches production.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
