// Config type definitions

export interface TailrecConfig {
  collector_model: string;
  bridge_model: string;
  cards_dir: string;
  state_dir: string;
  shared_card_sort_key: "filename" | "frontmatter_order";
}

export const DEFAULT_CONFIG: TailrecConfig = {
  collector_model: "claude-haiku-4-20250514",
  bridge_model: "claude-haiku-4-20250514",
  cards_dir: ".tailrec/.cards",
  state_dir: ".tailrec/state",
  shared_card_sort_key: "filename",
};
