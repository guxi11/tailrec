// Config type definitions

export interface TailrecConfig {
  backend: string;
  model: string;
  collector_model: string;
  cards_dir: string;
  state_dir: string;
  shared_card_sort_key: "filename" | "frontmatter_order";
}

export const DEFAULT_CONFIG: TailrecConfig = {
  backend: "claude",
  model: "claude-sonnet-4-20250514",
  collector_model: "claude-haiku-4-20250514",
  cards_dir: ".tailrec/cards",
  state_dir: ".tailrec/state",
  shared_card_sort_key: "filename",
};
