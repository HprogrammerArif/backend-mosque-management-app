import type { IncomingMessage } from 'node:http';
import { AppError } from '../common/errors/app-error.js';

const DEFAULT_LIMIT_BYTES = 1_000_000;   // 1 MB; sync push batches are the largest payload

export async function parseJsonBody(
  req: IncomingMessage,
  limitBytes: number = DEFAULT_LIMIT_BYTES,
): Promise<unknown> {
  const contentType = req.headers['content-type'] ?? '';
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    // Stop reading at the cap rather than buffering the whole payload first.
    if (size > limitBytes) {
      throw new AppError('VALIDATION_FAILED', `Request body exceeds ${limitBytes} bytes`);
    }
    chunks.push(buffer);
  }

  if (size === 0) return undefined;

  if (!contentType.includes('application/json')) {
    throw new AppError('VALIDATION_FAILED', 'Content-Type must be application/json');
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Request body is not valid JSON');
  }
}
