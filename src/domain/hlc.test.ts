import { describe, it, expect } from 'vitest';
import { localEvent, receiveEvent, compareHlc, serializeHlc, parseHlc, type Hlc } from './hlc.js';

const clock = (wall: number, counter: number, node = 'A'): Hlc => ({ wall, counter, node });

describe('localEvent', () => {
  it('advances the counter when the wall clock has not moved', () => {
    expect(localEvent(clock(1000, 3), 1000)).toEqual(clock(1000, 4));
  });

  it('advances the counter when now is behind the clock (a device with a slow clock)', () => {
    expect(localEvent(clock(1000, 3), 500)).toEqual(clock(1000, 4));
  });

  it('resets the counter when now moves the wall clock forward', () => {
    expect(localEvent(clock(1000, 5), 2000)).toEqual(clock(2000, 0));
  });

  it('preserves the node', () => {
    expect(localEvent(clock(1000, 0, 'device-x'), 1000).node).toBe('device-x');
  });
});

describe('receiveEvent', () => {
  it('takes the max of both counters plus one when both walls tie with now', () => {
    const local = clock(1000, 3, 'A');
    const incoming = clock(1000, 7, 'B');
    expect(receiveEvent(local, incoming, 1000)).toEqual(clock(1000, 8, 'A'));
  });

  it('advances the local counter when only the local wall wins', () => {
    const local = clock(2000, 3, 'A');
    const incoming = clock(1000, 99, 'B');
    expect(receiveEvent(local, incoming, 1500)).toEqual(clock(2000, 4, 'A'));
  });

  it('advances the incoming counter when only the incoming wall wins', () => {
    const local = clock(1000, 3, 'A');
    const incoming = clock(2000, 5, 'B');
    expect(receiveEvent(local, incoming, 1500)).toEqual(clock(2000, 6, 'A'));
  });

  it('resets the counter when the wall clock (now) outruns both', () => {
    const local = clock(1000, 3, 'A');
    const incoming = clock(1000, 5, 'B');
    expect(receiveEvent(local, incoming, 5000)).toEqual(clock(5000, 0, 'A'));
  });

  it('always keeps the receiver\'s own node, never the sender\'s', () => {
    const local = clock(1000, 0, 'receiver');
    const incoming = clock(9999, 0, 'sender');
    expect(receiveEvent(local, incoming, 0).node).toBe('receiver');
  });
});

describe('compareHlc', () => {
  it('orders by wall clock first', () => {
    expect(compareHlc(clock(1000, 0), clock(2000, 0))).toBeLessThan(0);
  });

  it('orders by counter when walls tie', () => {
    expect(compareHlc(clock(1000, 1), clock(1000, 2))).toBeLessThan(0);
  });

  it('breaks a full tie deterministically by node', () => {
    expect(compareHlc(clock(1000, 1, 'A'), clock(1000, 1, 'B'))).toBeLessThan(0);
    expect(compareHlc(clock(1000, 1, 'B'), clock(1000, 1, 'A'))).toBeGreaterThan(0);
  });

  it('is zero for two identical clocks', () => {
    expect(compareHlc(clock(1000, 1, 'A'), clock(1000, 1, 'A'))).toBe(0);
  });
});

describe('serializeHlc / parseHlc', () => {
  it('round-trips a clock through serialize/parse', () => {
    const original = clock(1_700_000_000_000, 42, 'device-9');
    expect(parseHlc(serializeHlc(original))).toEqual(original);
  });

  it('zero-pads so lexical string order matches HLC order', () => {
    const earlier = serializeHlc(clock(1000, 1, 'A'));
    const later = serializeHlc(clock(1000, 2, 'A'));
    expect(earlier < later).toBe(true);
  });

  it('zero-pads across a wall-clock jump too', () => {
    const earlier = serializeHlc(clock(999, 999999, 'A'));
    const later = serializeHlc(clock(1000, 0, 'A'));
    expect(earlier < later).toBe(true);
  });

  it('throws on a malformed string', () => {
    expect(() => parseHlc('not-a-clock')).toThrow(/Malformed HLC/);
  });
});
