// Card graph — bidirectional link queries

import type { Card } from "./workspace.js";

export interface CardGraph {
  forward: Map<string, string[]>;  // card -> cards it links to
  backward: Map<string, string[]>; // card -> cards that link to it
}

export const buildGraph = (cards: Card[]): CardGraph => {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();

  for (const card of cards) {
    forward.set(card.name, card.links);
    for (const link of card.links) {
      const existing = backward.get(link) ?? [];
      existing.push(card.name);
      backward.set(link, existing);
    }
  }

  return { forward, backward };
};

export const backlinksOf = (graph: CardGraph, name: string): string[] =>
  graph.backward.get(name) ?? [];

export const forwardLinksOf = (graph: CardGraph, name: string): string[] =>
  graph.forward.get(name) ?? [];

// Extract subgraph reachable from a given card (BFS)
export const subgraph = (graph: CardGraph, root: string, maxDepth = 3): Set<string> => {
  const visited = new Set<string>();
  const queue: Array<[string, number]> = [[root, 0]];

  while (queue.length > 0) {
    const [node, depth] = queue.shift()!;
    if (visited.has(node) || depth > maxDepth) continue;
    visited.add(node);
    const links = [...(graph.forward.get(node) ?? []), ...(graph.backward.get(node) ?? [])];
    for (const link of links) {
      if (!visited.has(link)) queue.push([link, depth + 1]);
    }
  }

  return visited;
};
