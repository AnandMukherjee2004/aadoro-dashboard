import { readStockSheets } from "@/lib/google-sheet";
import type { Product, PurchaseLine, SaleLine, StockData } from "@/lib/types";

const READY_SHEET = "Ready Available in WH";

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function asQty(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function asHsn(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  const text = asText(value);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/**
 * Date columns are Excel serials. SheetJS date objects land just before
 * local midnight here (11 Sep becomes 10 Sep 23:59), so convert the serial
 * from the 1900 date system instead.
 */
function asIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    const year = utc.getUTCFullYear();
    const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
    const day = String(utc.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return null;
}

function rowsOf(sheets: Record<string, unknown[][]>, sheetName: string): unknown[][] {
  const rows = sheets[sheetName];
  if (!rows) {
    throw new Error(`Google Sheet is missing the "${sheetName}" tab. Found: ${Object.keys(sheets).join(", ")}.`);
  }
  return rows;
}

function addQty(map: Map<string, number>, sku: string, qty: number) {
  map.set(sku, roundQty((map.get(sku) ?? 0) + qty));
}

export async function loadStock(): Promise<StockData> {
  const { title, sheets } = await readStockSheets();

  const purchases: PurchaseLine[] = [];
  for (const row of rowsOf(sheets, "Purchase")) {
    const sku = asText(row[5]);
    if (!sku || sku.toLowerCase() === "product name" || sku.toLowerCase() === "total") continue;
    purchases.push({
      date: asIsoDate(row[2]),
      vendor: asText(row[3]),
      bill: asText(row[4]),
      sku,
      gstPercent: null,
      qty: asQty(row[6]),
      remarks: asText(row[7]),
    });
  }

  const sales: SaleLine[] = [];
  for (const row of rowsOf(sheets, "Sales")) {
    const sku = asText(row[6]);
    if (!sku || sku.toLowerCase() === "item name" || sku.toLowerCase() === "total") continue;
    sales.push({
      date: asIsoDate(row[2]),
      customer: asText(row[3]),
      salesPoc: asText(row[4]),
      invoice: asText(row[5]),
      sku,
      qty: asQty(row[7]),
      remarks: asText(row[8]),
    });
  }

  const purchasedBySku = new Map<string, number>();
  const soldBySku = new Map<string, number>();
  for (const line of purchases) addQty(purchasedBySku, line.sku, line.qty);
  for (const line of sales) addQty(soldBySku, line.sku, line.qty);

  const seen = new Set<string>();
  const products: Product[] = [];

  for (const row of rowsOf(sheets, READY_SHEET)) {
    const name = asText(row[1]);
    const sku = asText(row[2]);
    if (!name && !sku) continue;
    if (name.toLowerCase() === "product name" || sku.toLowerCase() === "sku") continue;
    const key = sku || name;
    if (seen.has(key)) continue;
    seen.add(key);
    const purchased = purchasedBySku.get(key) ?? 0;
    const sold = soldBySku.get(key) ?? 0;
    const available = roundQty(purchased - sold);
    const cached = row[4];
    const sheetAvailable =
      typeof cached === "number" && Number.isFinite(cached) && cached !== available ? cached : null;
    products.push({
      order: products.length,
      brand: asText(row[0]),
      name: name || key,
      sku: key,
      hsn: asHsn(row[3]),
      purchased,
      sold,
      available,
      sheetAvailable,
      unlisted: false,
    });
  }

  for (const sku of new Set([...purchasedBySku.keys(), ...soldBySku.keys()])) {
    if (seen.has(sku)) continue;
    const purchased = purchasedBySku.get(sku) ?? 0;
    const sold = soldBySku.get(sku) ?? 0;
    products.push({
      order: products.length,
      brand: "",
      name: sku,
      sku,
      hsn: "",
      purchased,
      sold,
      available: roundQty(purchased - sold),
      sheetAvailable: null,
      unlisted: true,
    });
  }

  const dates = [...purchases, ...sales].map((line) => line.date).filter((date): date is string => Boolean(date));
  dates.sort();

  return {
    sourceFile: title,
    period: {
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
    },
    products,
    purchases,
    sales,
  };
}
