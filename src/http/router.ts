import type { HttpMethod, MatchResult, RouteDefinition } from './types.js';

type Node = {
  /** Static child segments, keyed by literal text. Checked before the parameter child. */
  statics: Map<string, Node>;
  /** At most one parameter child per node, with the name to bind. */
  param?: { name: string; node: Node };
  /** Routes terminating at this node, keyed by method. */
  handlers: Map<HttpMethod, RouteDefinition>;
};

function emptyNode(): Node {
  return { statics: new Map(), handlers: new Map() };
}

function segments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

export class Router {
  readonly #root: Node = emptyNode();
  readonly #all: RouteDefinition[] = [];

  add(route: RouteDefinition): void {
    let node = this.#root;

    for (const segment of segments(route.path)) {
      if (segment.startsWith(':')) {
        const name = segment.slice(1);
        if (node.param && node.param.name !== name) {
          throw new Error(
            `Conflicting parameter names at the same position: ':${node.param.name}' and ':${name}'`,
          );
        }
        node.param ??= { name, node: emptyNode() };
        node = node.param.node;
      } else {
        let next = node.statics.get(segment);
        if (!next) { next = emptyNode(); node.statics.set(segment, next); }
        node = next;
      }
    }

    if (node.handlers.has(route.method)) {
      throw new Error(`Route already registered: ${route.method} ${route.path}`);
    }
    node.handlers.set(route.method, route);
    this.#all.push(route);
  }

  match(method: string, path: string): MatchResult | null {
    const parts = segments(path);
    const params: Record<string, string> = {};
    let node = this.#root;

    for (const part of parts) {
      const staticChild = node.statics.get(part);
      if (staticChild) {
        // Static always wins over a parameter, whatever the registration order.
        node = staticChild;
        continue;
      }
      if (node.param) {
        params[node.param.name] = decodeURIComponent(part);
        node = node.param.node;
        continue;
      }
      return null;
    }

    const route = node.handlers.get(method as HttpMethod);
    return route ? { route, params } : null;
  }

  routes(): readonly RouteDefinition[] {
    return this.#all;
  }
}
