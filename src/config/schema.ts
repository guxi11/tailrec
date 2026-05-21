// Config type definitions

export interface DeckhandConfig {
  backend: string;
  model: string;
  collector_model: string;
  cards_dir: string;
  state_dir: string;
  shared_card_sort_key: "filename" | "frontmatter_order";
}

export const DEFAULT_CONFIG: DeckhandConfig = {
  backend: "claude",
  model: "claude-sonnet-4-20250514",
  collector_model: "claude-haiku-4-20250514",
  cards_dir: ".deckhand/cards",
  state_dir: ".deckhand/state",
  shared_card_sort_key: "filename",
};
