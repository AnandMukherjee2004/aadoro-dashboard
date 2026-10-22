import { StockReport } from "@/components/StockReport";
import { loadStock } from "@/lib/load-stock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  try {
    const data = await loadStock();
    return <StockReport data={data} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the Google Sheet.";
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Frido</p>
        <h1 className="display mt-3 text-3xl">Aadoro stock report unavailable</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">{message}</p>
      </main>
    );
  }
}
