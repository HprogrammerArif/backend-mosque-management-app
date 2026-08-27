import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { parseJsonBody } from './body.js';

function fakeRequest(payload: string, contentType = 'application/json'): IncomingMessage {
  const stream = Readable.from([Buffer.from(payload)]) as unknown as IncomingMessage;
  stream.headers = { 'content-type': contentType };
  return stream;
}

describe('parseJsonBody', () => {
  it('parses a JSON object', async () => {
    await expect(parseJsonBody(fakeRequest('{"amountMinor":50000}')))
      .resolves.toEqual({ amountMinor: 50000 });
  });

  it('returns undefined for an empty body', async () => {
    await expect(parseJsonBody(fakeRequest(''))).resolves.toBeUndefined();
  });

  it('rejects malformed JSON with a stable code', async () => {
    await expect(parseJsonBody(fakeRequest('{not json'))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('rejects a non-JSON content type', async () => {
    await expect(parseJsonBody(fakeRequest('hello', 'text/plain'))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('rejects a body over the size cap without buffering it all', async () => {
    const huge = JSON.stringify({ note: 'x'.repeat(2000) });
    await expect(parseJsonBody(fakeRequest(huge), 1000)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
