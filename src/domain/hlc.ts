/**
 * Hybrid Logical Clock — offline-sync-protocol.md §3. Orders concurrent field-level
 * edits without trusting wall clocks (a device's clock may be badly wrong). The
 * algorithm is identical on client and server by design; this is the server copy,
 * DUPLICATED into the frontend (same ADR-0011 discipline as Money) rather than shared,
 * since there is no shared package between the two repos.
 */
export type Hlc = { wall: number; counter: number; node: string };

export function localEvent(clock: Hlc, now: number): Hlc {
  const wall = Math.max(clock.wall, now);
  const counter = wall === clock.wall ? clock.counter + 1 : 0;
  return { wall, counter, node: clock.node };
}

export function receiveEvent(clock: Hlc, incoming: Hlc, now: number): Hlc {
  const wall = Math.max(clock.wall, incoming.wall, now);
  let counter: number;
  if (wall === clock.wall && wall === incoming.wall) {
    counter = Math.max(clock.counter, incoming.counter) + 1;
  } else if (wall === clock.wall) {
    counter = clock.counter + 1;
  } else if (wall === incoming.wall) {
    counter = incoming.counter + 1;
  } else {
    counter = 0;
  }
  return { wall, counter, node: clock.node };
}

/** Total order. The node tiebreaker is what makes merges deterministic across replicas. */
export function compareHlc(a: Hlc, b: Hlc): number {
  return a.wall - b.wall || a.counter - b.counter || a.node.localeCompare(b.node);
}

/** `{wall}:{counter}:{node}` — zero-padded so it also sorts correctly as a plain string. */
export function serializeHlc(clock: Hlc): string {
  return `${clock.wall.toString().padStart(15, '0')}:${clock.counter.toString().padStart(6, '0')}:${clock.node}`;
}

export function parseHlc(serialized: string): Hlc {
  const [wall, counter, node] = serialized.split(':');
  if (wall === undefined || counter === undefined || node === undefined) {
    throw new Error(`Malformed HLC: ${serialized}`);
  }
  return { wall: Number(wall), counter: Number(counter), node };
}
