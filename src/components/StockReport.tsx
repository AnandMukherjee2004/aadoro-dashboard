"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LOW_ON_HAND,
  distinctSku,
  productFamily,
  stockStatus,
  type StockStatus,
} from "@/lib/catalog";
import { formatDate, formatPeriod, formatQty } from "@/lib/format";
import type { Product, PurchaseLine, SaleLine, StockData } from "@/lib/types";

type StatusFilter = "all" | StockStatus;
type SortKey = "sheet" | "name" | "hsn" | "purchased" | "sold" | "available";
type SortDir = "asc" | "desc";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "healthy", label: "Healthy" },
  { id: "low", label: "Low" },
  { id: "out", label: "Out" },
];

function sum(products: Product[], key: "purchased" | "sold" | "available"): number {
  return products.reduce((total, product) => total + product[key], 0);
}

function compareProducts(a: Product, b: Product, key: SortKey, dir: SortDir): number {
  if (key === "sheet") return a.order - b.order;
  let result = 0;
  if (key === "name") result = a.name.localeCompare(b.name, "en");
  else if (key === "hsn") result = a.hsn.localeCompare(b.hsn, "en");
  else result = a[key] - b[key];
  if (result === 0) result = a.order - b.order;
  return dir === "asc" ? result : -result;
}

function byDateDesc<T extends { date: string | null }>(a: T, b: T): number {
  if (a.date === b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date < b.date ? 1 : -1;
}

function weekStart(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  return formatDate(iso).replace(/ \d{4}$/, "");
}

function qtyTone(state: StockStatus): string {
  if (state === "out") return "text-[#e5484d]";
  if (state === "low") return "text-black";
  return "text-good";
}

export function StockReport({ data }: { data: StockData }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [family, setFamily] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "available", dir: "desc" });
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(
    () => ({
      purchased: sum(data.products, "purchased"),
      sold: sum(data.products, "sold"),
      available: sum(data.products, "available"),
    }),
    [data.products],
  );

  const notes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const line of [...data.purchases, ...data.sales]) {
      if (!line.remarks) continue;
      const current = map.get(line.sku) ?? [];
      if (!current.includes(line.remarks)) current.push(line.remarks);
      map.set(line.sku, current);
    }
    return map;
  }, [data.purchases, data.sales]);

  const health = useMemo(() => {
    const next = { healthy: 0, low: 0, out: 0 };
    for (const product of data.products) next[stockStatus(product.available)] += 1;
    return next;
  }, [data.products]);

  const weeks = useMemo(() => {
    const map = new Map<string, { purchased: number; sold: number }>();
    function add(date: string | null, key: "purchased" | "sold", qty: number) {
      if (!date) return;
      const week = weekStart(date);
      const row = map.get(week) ?? { purchased: 0, sold: 0 };
      row[key] += qty;
      map.set(week, row);
    }
    for (const line of data.purchases) add(line.date, "purchased", line.qty);
    for (const line of data.sales) add(line.date, "sold", line.qty);
    let onHand = 0;
    return [...map.keys()].sort().map((week) => {
      const row = map.get(week) ?? { purchased: 0, sold: 0 };
      onHand += row.purchased - row.sold;
      return { week, ...row, onHand };
    });
  }, [data.purchases, data.sales]);

  const familyBars = useMemo(() => {
    const map = new Map<string, { available: number; skus: number }>();
    for (const product of data.products) {
      const name = productFamily(product);
      const row = map.get(name) ?? { available: 0, skus: 0 };
      row.available += product.available;
      row.skus += 1;
      map.set(name, row);
    }
    return [...map.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.available - a.available);
  }, [data.products]);

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.products.filter((product) => {
      if (family !== "all" && productFamily(product) !== family) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.hsn, product.brand, productFamily(product)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data.products, family, query]);

  const counts = useMemo(() => {
    const next = { all: searched.length, healthy: 0, low: 0, out: 0 };
    for (const product of searched) next[stockStatus(product.available)] += 1;
    return next;
  }, [searched]);

  const visible = useMemo(() => {
    const filtered =
      status === "all" ? searched : searched.filter((product) => stockStatus(product.available) === status);
    return [...filtered].sort((a, b) => compareProducts(a, b, sort.key, sort.dir));
  }, [searched, sort, status]);

  const visibleTotals = useMemo(
    () => ({
      purchased: sum(visible, "purchased"),
      sold: sum(visible, "sold"),
      available: sum(visible, "available"),
    }),
    [visible],
  );

  const selected = data.products.find((product) => product.sku === selectedSku) ?? null;
  const selectedPurchases = useMemo(
    () => data.purchases.filter((line) => line.sku === selectedSku).sort(byDateDesc),
    [data.purchases, selectedSku],
  );
  const selectedSales = useMemo(
    () => data.sales.filter((line) => line.sku === selectedSku).sort(byDateDesc),
    [data.sales, selectedSku],
  );

  const stockouts = data.products.filter((product) => product.available <= 0);
  const period = formatPeriod(data.period.from, data.period.to);
  const healthyShare = data.products.length ? Math.round((health.healthy / data.products.length) * 100) : 0;
  const tightShare = 100 - healthyShare;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setSelectedSku(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const narrow = window.matchMedia("(max-width: 1023px)").matches;
    if (!narrow) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected]);

  function toggleSort(key: Exclude<SortKey, "sheet">) {
    setSort((current) => {
      if (current.key !== key) {
        const dir: SortDir = key === "name" || key === "hsn" ? "asc" : "desc";
        return { key, dir };
      }
      if (current.dir === "desc") return { key, dir: "asc" };
      return { key: "sheet", dir: "asc" };
    });
  }

  function applyStatus(next: StatusFilter) {
    setStatus(next);
    setFamily("all");
  }

  return (
    <div className="min-h-screen bg-canvas text-ink md:pl-[76px] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden print:h-auto print:overflow-visible">
      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-[76px] flex-col items-center gap-2 py-5 md:flex">
        <RailButton label="All stock" active={status === "all" && family === "all"} onClick={() => applyStatus("all")}>
          <IconGrid />
        </RailButton>
        <RailButton label="Healthy" active={status === "healthy"} onClick={() => applyStatus("healthy")}>
          <IconCheck />
        </RailButton>
        <RailButton label="Low" active={status === "low"} onClick={() => applyStatus("low")}>
          <IconAlert />
        </RailButton>
        <RailButton label="Out of stock" active={status === "out"} onClick={() => applyStatus("out")}>
          <IconBox />
        </RailButton>
      </aside>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:min-h-0 lg:flex-1">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image
              src="/frido-logo.png"
              alt="Frido"
              width={128}
              height={47}
              priority
              className="h-7 w-auto"
            />
            <span className="h-8 w-px bg-line" aria-hidden />
            <Image
              src="/aadoro-logo.png"
              alt="Aadoro"
              width={280}
              height={94}
              priority
              className="h-11 w-auto"
            />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold">Warehouse</p>
              <p className="text-[15px] font-semibold text-muted">Stock</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
            {period && (
              <p className="hidden rounded-full bg-card px-3 py-2 text-xs font-medium text-muted shadow-sm lg:block">
                {period}
              </p>
            )}
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-card px-3 py-2 shadow-sm sm:w-64 sm:flex-none">
              <IconSearch />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product or SKU"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </label>
          </div>
        </header>

        <div className="flex flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid shrink-0 gap-4 md:grid-cols-3 lg:col-start-1 lg:row-start-1">
            <article className="flex min-h-[210px] flex-col rounded-[22px] bg-night p-5 text-white">
              <p className="text-sm font-medium text-white/70">On hand</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{formatQty(totals.available)}</p>
              <p className="mt-1 text-xs text-white/55">{formatQty(totals.purchased)} purchased</p>
              <div className="mt-auto">
                <Sparkline values={weeks.map((week) => week.onHand)} />
                <div className="flex justify-between text-[11px] text-white/45">
                  <span>{weeks[0] ? shortDate(weeks[0].week) : ""}</span>
                  <span>{weeks.at(-1) ? shortDate(weeks.at(-1)!.week) : ""}</span>
                </div>
              </div>
            </article>

            <article className="flex min-h-[210px] flex-col rounded-[22px] bg-sun p-5 text-black">
              <p className="text-sm font-medium text-black/70">Sale qty</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{formatQty(totals.sold)}</p>
              <p className="mt-1 text-xs text-black/60">{data.sales.length} invoice lines</p>
              <div className="mt-4 flex h-[72px] overflow-hidden rounded-2xl text-[11px] font-semibold">
                <div className="flex min-w-0 flex-col justify-end bg-white px-3 py-2 text-black" style={{ width: `${healthyShare}%` }}>
                  <span className="text-base leading-none">{healthyShare}%</span>
                  <span className="mt-1 text-[10px] font-medium text-ink/70">Healthy</span>
                </div>
                <div className="flex min-w-0 flex-col justify-end bg-night px-3 py-2 text-white" style={{ width: `${tightShare}%` }}>
                  <span className="text-base leading-none">{tightShare}%</span>
                  <span className="mt-1 text-[10px] font-medium text-white/70">Low or out</span>
                </div>
              </div>
            </article>

            <article className="flex min-h-[210px] flex-col rounded-[22px] bg-butter p-5">
              <p className="text-sm font-medium text-muted">Purchase qty</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{formatQty(totals.purchased)}</p>
              <p className="mt-1 text-xs text-muted">{data.purchases.length} bill lines</p>
              <div className="mt-auto">
                <WeekBars weeks={weeks} />
              </div>
            </article>
          </div>

          <aside className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto">
            <section className="rounded-[22px] bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">By category</h2>
                <span className="text-xs text-muted">Units on hand</span>
              </div>
              <ul className="mt-4 space-y-3">
                {familyBars.slice(0, 6).map((bar) => {
                  const max = familyBars[0]?.available || 1;
                  const active = family === bar.name;
                  return (
                    <li key={bar.name}>
                      <button
                        type="button"
                        onClick={() => setFamily(active ? "all" : bar.name)}
                        className="block w-full text-left"
                      >
                        <span className="flex items-baseline justify-between text-xs">
                          <span className={active ? "font-semibold text-black" : "text-ink"}>{bar.name}</span>
                          <span className="tabular-nums text-muted">{formatQty(bar.available)}</span>
                        </span>
                        <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-soft">
                          <span
                            className={`block h-full rounded-full ${active ? "bg-sun" : "bg-night"}`}
                            style={{ width: `${Math.max(6, (bar.available / max) * 100)}%` }}
                          />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-[22px] bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Out of stock</h2>
              <ul className="mt-3 divide-y divide-line">
                {stockouts.map((product) => (
                  <li key={product.sku}>
                    <button
                      type="button"
                      onClick={() => {
                        setStatus("out");
                        setFamily("all");
                        setSelectedSku(product.sku);
                      }}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm"
                    >
                      <span className="min-w-0 truncate">{product.name}</span>
                      <span className="font-semibold text-[#e5484d] tabular-nums">0</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Low means {LOW_ON_HAND} units or fewer.</p>
            </section>
          </aside>

          <section className="flex min-w-0 flex-col rounded-[22px] bg-card shadow-sm lg:col-start-1 lg:row-start-2 lg:min-h-0">
            <div className="relative z-20 flex shrink-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-base font-semibold">Ready available in WH</h2>
                <p className="text-xs text-muted">
                  {visible.length} SKU{visible.length === 1 ? "" : "s"}
                  {family !== "all" ? ` · ${family}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-full bg-soft p-1" role="group" aria-label="Stock status">
                  {STATUS_FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={status === option.id}
                      onClick={() => setStatus(option.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        status === option.id ? "bg-sun text-black" : "text-ink/70 hover:text-ink"
                      }`}
                    >
                      {option.label}
                      <span className="ml-1 tabular-nums opacity-80">{counts[option.id]}</span>
                    </button>
                  ))}
                </div>
                <CategoryMenu value={family} options={familyBars} onChange={setFamily} />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto overscroll-contain border-t border-line print:overflow-visible">
            <ul className="divide-y divide-line md:hidden">
              {visible.length === 0 && <li className="px-4 py-12 text-center text-sm text-muted">No SKUs match this view.</li>}
              {visible.map((product) => {
                const state = stockStatus(product.available);
                return (
                  <li key={product.sku}>
                    <button
                      type="button"
                      onClick={() => setSelectedSku(product.sku)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                        product.sku === selectedSku ? "bg-butter" : ""
                      }`}
                    >
                      <Mark name={product.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{product.name}</span>
                        <span className="mt-0.5 block text-xs text-muted tabular-nums">
                          Purchase {formatQty(product.purchased)} · Sale {formatQty(product.sold)}
                        </span>
                      </span>
                      <span className={`text-sm font-semibold tabular-nums ${qtyTone(state)}`}>
                        {formatQty(product.available)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="hidden md:block">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted">
                    <th className="sticky top-0 z-10 border-b border-line bg-card px-5 py-3 font-medium">Product</th>
                    <SortHeader label="HSN" align="left" active={sort.key === "hsn"} dir={sort.dir} onClick={() => toggleSort("hsn")} />
                    <SortHeader label="Purchase" align="right" active={sort.key === "purchased"} dir={sort.dir} onClick={() => toggleSort("purchased")} />
                    <SortHeader label="Sale" align="right" active={sort.key === "sold"} dir={sort.dir} onClick={() => toggleSort("sold")} />
                    <SortHeader label="Available" align="right" active={sort.key === "available"} dir={sort.dir} onClick={() => toggleSort("available")} />
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-16 text-center text-muted">
                        No SKUs match this view.
                      </td>
                    </tr>
                  )}
                  {visible.map((product) => {
                    const state = stockStatus(product.available);
                    const skuLine = distinctSku(product);
                    const isSelected = product.sku === selectedSku;
                    return (
                      <tr
                        key={product.sku}
                        data-sku={product.sku}
                        role="button"
                        tabIndex={0}
                        aria-selected={isSelected}
                        onClick={() => setSelectedSku(product.sku)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedSku(product.sku);
                          }
                        }}
                        className={`cursor-pointer outline-none ${
                          isSelected ? "bg-butter" : "hover:bg-soft"
                        } [&>td]:border-t [&>td]:border-line`}
                      >
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-3">
                            <Mark name={product.name} />
                            <span className="min-w-0">
                              <span className="block font-semibold leading-snug">
                                {product.name}
                                {notes.has(product.sku) && (
                                  <span className="ml-2 rounded-full bg-sun px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">Note</span>
                                )}
                              </span>
                              {skuLine && <span className="block text-xs text-muted">{skuLine}</span>}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted tabular-nums">{product.hsn || "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatQty(product.purchased)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatQty(product.sold)}</td>
                        <td className={`px-5 py-3 text-right font-semibold tabular-nums ${qtyTone(state)}`}>
                          {formatQty(product.available)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {visible.length > 0 && (
                  <tfoot>
                    <tr className="text-sm font-semibold [&>td]:border-t [&>td]:border-line">
                      <td className="px-5 py-3">
                        {status === "all" && family === "all" && !query.trim() ? "Total" : "Filtered total"}
                      </td>
                      <td />
                      <td className="px-3 py-3 text-right tabular-nums">{formatQty(visibleTotals.purchased)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatQty(visibleTotals.sold)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatQty(visibleTotals.available)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            </div>
            <p className="shrink-0 border-t border-line px-5 py-3 text-xs text-muted">
              Available is purchase qty minus sale qty, from {data.sourceFile}. Refresh the page after the sheet changes.
            </p>
          </section>
        </div>
      </div>

      {selected && (
        <>
          <button
            type="button"
            aria-label="Close SKU detail"
            className="no-print fixed inset-0 z-30 bg-night/30 lg:bg-night/20"
            onClick={() => setSelectedSku(null)}
          />
          <SkuPanel
            product={selected}
            purchases={selectedPurchases}
            sales={selectedSales}
            notes={notes.get(selected.sku) ?? []}
            onClose={() => setSelectedSku(null)}
          />
        </>
      )}
    </div>
  );
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-11 w-11 place-items-center rounded-2xl ${
        active ? "bg-night text-white" : "text-muted hover:bg-card hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Mark({ name }: { name: string }) {
  const words = name.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
  const letters = ((words[0]?.[0] ?? "F") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-soft text-xs font-bold text-ink">
      {letters}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="mt-4 h-14" />;
  const width = 240;
  const height = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 6 - ((value - min) / span) * (height - 14);
    return { x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mb-1 h-14 w-full text-white/80" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={line} />
      <circle cx={last.x} cy={last.y} r="3.5" fill="white" />
    </svg>
  );
}

function WeekBars({ weeks }: { weeks: { week: string; purchased: number }[] }) {
  const max = Math.max(...weeks.map((week) => week.purchased), 1);
  const shown = weeks.slice(-8);
  return (
    <div className="flex h-16 items-end gap-1.5">
      {shown.map((week) => (
        <div key={week.week} className="flex h-full flex-1 flex-col justify-end" title={`${shortDate(week.week)} · ${formatQty(week.purchased)}`}>
          <div
            className="rounded-md bg-night/85"
            style={{ height: `${Math.max(14, Math.sqrt(week.purchased / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function SortHeader({
  label,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  align: "left" | "right";
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className={`sticky top-0 z-10 border-b border-line bg-card px-3 py-3 font-medium ${align === "right" ? "text-right" : ""}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 text-xs font-medium ${active ? "text-ink" : "text-muted"} ${
          align === "right" ? "flex-row-reverse" : ""
        }`}
      >
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function SkuPanel({
  product,
  purchases,
  sales,
  notes,
  onClose,
}: {
  product: Product;
  purchases: PurchaseLine[];
  sales: SaleLine[];
  notes: string[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const state = stockStatus(product.available);

  useEffect(() => {
    closeRef.current?.focus();
  }, [product.sku]);

  return (
    <aside className="no-print fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col bg-card shadow-[-16px_0_50px_rgba(20,20,30,0.12)]">
      <div className="flex items-start justify-between gap-4 px-5 py-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{[product.brand || "Unlisted", productFamily(product)].join(" · ")}</p>
          <h2 className="mt-1 text-xl font-semibold leading-tight">{product.name}</h2>
          <p className="mt-1 text-xs text-muted">{product.sku}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-soft text-sm font-semibold hover:bg-mist"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-soft p-3">
          <PanelFigure label="Purchase" value={product.purchased} />
          <PanelFigure label="Sale" value={product.sold} />
          <PanelFigure label="Available" value={product.available} tone={state} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">HSN</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{product.hsn || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Sell-through</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {product.purchased > 0 ? `${Math.round((product.sold / product.purchased) * 1000) / 10}%` : "—"}
            </dd>
          </div>
        </dl>

        {product.sheetAvailable != null && (
          <p className="mt-4 rounded-2xl bg-butter px-3 py-2 text-sm text-black">
            The worksheet shows {formatQty(product.sheetAvailable)} on hand. Purchase and sales lines add up to{" "}
            {formatQty(product.available)}.
          </p>
        )}

        {notes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {notes.map((note) => (
              <li key={note} className="rounded-2xl bg-butter px-3 py-2 text-sm">
                {note}
              </li>
            ))}
          </ul>
        )}

        <MovementList
          title="Purchases"
          empty="No purchase bills for this SKU."
          countLabel={`${formatQty(purchases.reduce((total, line) => total + line.qty, 0))} units · ${purchases.length} line${purchases.length === 1 ? "" : "s"}`}
        >
          {purchases.map((line, index) => (
            <li key={`${line.bill}-${line.date}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 border-t border-line py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{formatDate(line.date)}</p>
                <p className="truncate text-xs text-muted">{line.vendor || "Vendor not recorded"}</p>
                <p className="text-xs text-muted">
                  {line.bill || "No bill number"}
                  {line.gstPercent != null ? ` · GST ${formatQty(line.gstPercent)}%` : ""}
                </p>
              </div>
              <p className="font-semibold tabular-nums">{formatQty(line.qty)}</p>
            </li>
          ))}
        </MovementList>

        <MovementList
          title="Sales"
          empty="No sales invoices for this SKU."
          countLabel={`${formatQty(sales.reduce((total, line) => total + line.qty, 0))} units · ${sales.length} line${sales.length === 1 ? "" : "s"}`}
        >
          {sales.map((line, index) => {
            const sample = line.invoice.trim().toLowerCase() === "sample";
            return (
              <li key={`${line.invoice}-${line.date}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 border-t border-line py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {formatDate(line.date)}
                    {sample && <span className="ml-2 rounded-full bg-sun px-1.5 py-0.5 text-[10px] font-semibold uppercase text-black">Sample</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{line.customer || "Customer not recorded"}</p>
                  <p className="text-xs text-muted">{line.invoice || "No invoice number"}</p>
                </div>
                <p className="font-semibold tabular-nums">{formatQty(line.qty)}</p>
              </li>
            );
          })}
        </MovementList>
      </div>
    </aside>
  );
}

function PanelFigure({ label, value, tone = "healthy" }: { label: string; value: number; tone?: StockStatus }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone === "healthy" ? "text-ink" : qtyTone(tone)}`}>
        {formatQty(value)}
      </p>
    </div>
  );
}

function MovementList({
  title,
  countLabel,
  empty,
  children,
}: {
  title: string;
  countLabel: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.some(Boolean);
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted tabular-nums">{countLabel}</p>
      </div>
      {hasItems ? <ul className="mt-2">{children}</ul> : <p className="mt-2 text-sm text-muted">{empty}</p>}
    </section>
  );
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.2 11 14.6 15.7 9.6" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 4.5 20.5 19H3.5L12 4.5Z" />
      <path d="M12 10v4.2" />
      <path d="M12 16.8h.01" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 8.5 12 4.5l8 4v9L12 21.5 4 17.5v-9Z" />
      <path d="M12 12.2 20 8.5M12 12.2 4 8.5M12 12.2V21" />
    </svg>
  );
}

function CategoryMenu({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { name: string; skus: number }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const total = options.reduce((count, option) => count + option.skus, 0);
  const label = value === "all" ? "All categories" : value;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Category"
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
          value === "all" ? "bg-soft text-ink" : "bg-sun text-black"
        }`}
      >
        <span>{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9.5 12 15.5 18 9.5" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Category"
          className="absolute left-0 z-30 mt-2 w-56 rounded-2xl bg-card p-1.5 shadow-lg ring-1 ring-black/5 sm:left-auto sm:right-0"
        >
          <li>
            <CategoryOption selected={value === "all"} label="All categories" count={total} onClick={() => choose("all")} />
          </li>
          {options.map((option) => (
            <li key={option.name}>
              <CategoryOption
                selected={value === option.name}
                label={option.name}
                count={option.skus}
                onClick={() => choose(option.name)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryOption({
  selected,
  label,
  count,
  onClick,
}: {
  selected: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left text-xs font-semibold ${
        selected ? "bg-sun text-black" : "text-ink hover:bg-butter"
      }`}
    >
      <span>{label}</span>
      <span className={`tabular-nums ${selected ? "text-black/60" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-muted" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  );
}
