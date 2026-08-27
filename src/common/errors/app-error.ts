import { ERROR_STATUS, type ErrorCode } from '../../domain/errors.js';

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    // Derived from the code, never passed in — one code can never map to two statuses.
    this.status = ERROR_STATUS[code];
  }
}
