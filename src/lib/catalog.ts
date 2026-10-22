import type { Product } from "@/lib/types";

/** Units still on hand at or under this count are marked low. */
export const LOW_ON_HAND = 10;

export const FAMILY_ORDER = [
  "Pillows",
  "Cushions",
  "Eye masks",
  "Therapy",
  "Orthotics",
  "Seating",
  "Workspace",
  "Fitness",
  "Other",
] as const;

export type StockStatus = "out" | "low" | "healthy";

export function stockStatus(available: number): StockStatus {
  if (available <= 0) return "out";
  if (available <= LOW_ON_HAND) return "low";
  return "healthy";
}

export function productFamily(product: Pick<Product, "name" | "sku">): string {
  const text = `${product.name} ${product.sku}`.toLowerCase();
  if (/(chair|monitor arm)/.test(text)) return "Seating";
  if (/therapy cap/.test(text)) return "Therapy";
  if (/(heel protector|posture corrector|orthotic)/.test(text)) return "Orthotics";
  if (/eye mask/.test(text)) return "Eye masks";
  if (/(yoga|balance trainer)/.test(text)) return "Fitness";
  if (/(footrest|standing desk)/.test(text)) return "Workspace";
  if (/pillow/.test(text)) return "Pillows";
  if (/(cushion|wedge)/.test(text)) return "Cushions";
  return "Other";
}

export function distinctSku(product: Product): string | null {
  const prefixed = product.brand ? `${product.brand} ${product.name}` : product.name;
  if (product.sku === prefixed || product.sku === product.name) return null;
  return product.sku;
}
