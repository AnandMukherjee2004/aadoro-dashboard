export type Product = {
  order: number;
  brand: string;
  name: string;
  sku: string;
  hsn: string;
  purchased: number;
  sold: number;
  available: number;
  /** Present when the worksheet's cached on-hand figure differs from the ledger. */
  sheetAvailable: number | null;
  unlisted: boolean;
};

export type PurchaseLine = {
  date: string | null;
  vendor: string;
  bill: string;
  sku: string;
  gstPercent: number | null;
  qty: number;
  remarks: string;
};

export type SaleLine = {
  date: string | null;
  customer: string;
  invoice: string;
  sku: string;
  qty: number;
  remarks: string;
};

export type StockData = {
  sourceFile: string;
  period: { from: string | null; to: string | null };
  products: Product[];
  purchases: PurchaseLine[];
  sales: SaleLine[];
};
