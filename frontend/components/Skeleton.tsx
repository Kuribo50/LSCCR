"use client";

import { motion, useReducedMotion } from "framer-motion";

const shimmer =
  "ccr-skeleton-shimmer relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.35s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent";

const TABLE_SKELETON_WIDTHS = ["68%", "84%", "56%", "92%", "46%", "72%", "38%"];
const TABLE_SKELETON_COLUMNS = [
  "minmax(180px,1.2fr)",
  "128px",
  "88px",
  "minmax(150px,1fr)",
  "112px",
  "112px",
  "96px",
];

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/* ---------- Primitives ---------- */

export function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={classes(
        "rounded-lg bg-gray-200/80",
        shimmer,
        className,
      )}
      style={style}
    />
  );
}

export function SkeletonText({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const w = size === "sm" ? "w-24" : size === "lg" ? "w-48" : "w-36";
  const h = size === "sm" ? "h-3" : size === "lg" ? "h-5" : "h-4";
  return <SkeletonBlock className={`${w} ${h}`} />;
}

/* ---------- Cards ---------- */

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-12 w-12 rounded-xl" />
        <div className="space-y-2 flex-1">
          <SkeletonBlock className="h-4 w-28 rounded-md" />
          <SkeletonBlock className="h-3 w-20 rounded-md" />
        </div>
      </div>
      <SkeletonBlock className="h-8 w-full rounded-xl" />
      <div className="flex gap-2">
        <SkeletonBlock className="h-9 flex-1 rounded-xl" />
        <SkeletonBlock className="h-9 flex-1 rounded-xl" />
      </div>
    </div>
  );
}

/* ---------- Dashboard ---------- */

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-5">
          <SkeletonBlock className="h-16 w-16 rounded-2xl" />
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-32 rounded-md" />
            <SkeletonBlock className="h-7 w-56 rounded-md" />
            <SkeletonBlock className="h-4 w-48 rounded-md" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Charts */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 lg:col-span-8">
          <div className="mb-6 flex items-center justify-between">
            <SkeletonBlock className="h-5 w-48 rounded-md" />
            <SkeletonBlock className="h-7 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[300px]">
            <SkeletonBlock className="h-full w-full rounded-2xl" />
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBlock key={i} className="h-12 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </div>

        {/* Action cards */}
        <div className="lg:col-span-4 grid grid-cols-1 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-[88px] w-full rounded-3xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Table ---------- */

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="ccr-table-skeleton ccr-data-table overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-[#262626] dark:bg-[#0f0f10]">
      <div
        className="ccr-table-head grid border-b border-gray-200 bg-gray-50/80 dark:border-[#262626] dark:bg-[#202020]"
        style={{ gridTemplateColumns: TABLE_SKELETON_COLUMNS.join(" ") }}
      >
        {TABLE_SKELETON_COLUMNS.map((_, i) => (
          <div key={i} className="border-r border-gray-200 px-2 py-2 last:border-r-0 dark:border-[#262626]">
            <SkeletonBlock className="h-3.5 rounded-md bg-slate-300/80 dark:bg-[#2a2a2a]" />
          </div>
        ))}
      </div>

      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <motion.div
            key={i}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { delay: i * 0.025, duration: 0.18 }}
            className="ccr-table-row grid border-b border-gray-100 bg-white last:border-b-0 dark:border-[#262626] dark:bg-[#151515]"
            style={{ gridTemplateColumns: TABLE_SKELETON_COLUMNS.join(" ") }}
          >
            {TABLE_SKELETON_COLUMNS.map((_, j) => {
              const isBadge = j === 4 || j === 5;
              const isAction = j === 6;
              return (
                <div key={j} className="flex h-9 items-center border-r border-gray-100 px-2 last:border-r-0 dark:border-[#262626]">
                  <SkeletonBlock
                    className={[
                      "bg-slate-200 dark:bg-[#2a2a2a]",
                      isBadge ? "h-5 rounded-full" : isAction ? "h-6 rounded-md" : "h-3.5 rounded-md",
                    ].join(" ")}
                    style={{
                      width: isBadge
                        ? "64px"
                        : isAction
                          ? "72px"
                          : TABLE_SKELETON_WIDTHS[(i + j) % TABLE_SKELETON_WIDTHS.length],
                    }}
                  />
                </div>
              );
            })}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Ficha (Panel) ---------- */

export function FichaSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
            <SkeletonBlock className="h-3 w-20 rounded-md" />
            <SkeletonBlock className="h-8 w-16 rounded-md" />
            <SkeletonBlock className="h-3 w-28 rounded-md" />
          </div>
        ))}
      </section>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-5 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
