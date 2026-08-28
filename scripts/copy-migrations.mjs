/**
 * tsc only compiles .ts files — it never copies the raw .sql migration files into dist/,
 * so a production build silently shipped with no migrations directory at all (Migrator's
 * readdirSync would throw ENOENT on first boot). Runs as a postbuild step.
 */
import { cpSync, existsSync } from 'node:fs';

const src = 'src/infrastructure/database/migrations';
const dest = 'dist/src/infrastructure/database/migrations';

if (!existsSync(src)) {
  throw new Error(`Migrations source directory not found: ${src}`);
}
cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
