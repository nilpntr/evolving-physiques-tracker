import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  checkSpreadsheetAccess,
  getSpreadsheetMeta,
  getTabData,
  saveDay,
  type ParsedWeekData,
  type SpreadsheetMeta,
} from "#/lib/sheets";
import type { ParsedField, ParsedSection } from "#/lib/tracker-config";

type LoaderData =
  | { allowed: false }
  | (SpreadsheetMeta & { allowed: true; tab: ParsedWeekData | null });
type DayValues = Record<string, string>;
type WeekValues = Record<number, DayValues>;
type WeekLevelValues = Record<string, string>;

const lsKey = (id: string) => `tracker-last-tab:${id}`;

/** Convert ISO date (YYYY-MM-DD) back to the sheet's D/M/YY format */
function isoToDMYY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${Number(d)}/${Number(m)}/${y.slice(2)}`;
}

/** Convert 0-indexed column number to a Sheets column letter (0→A, 4→E, …) */
function colLetter(col: number): string {
  return String.fromCharCode(65 + col);
}

/** Quote a sheet name for A1 notation when it contains spaces or special chars */
function a1Range(sheetName: string, col: number, row: number): string {
  const sheet = /[^A-Za-z0-9]/.test(sheetName) ? `'${sheetName}'` : sheetName;
  return `${sheet}!${colLetter(col)}${row}`;
}

const DUTCH_TO_EN: Record<string, string> = {
  ma: "Mon",
  di: "Tue",
  wo: "Wed",
  do: "Thu",
  vr: "Fri",
  za: "Sat",
  zo: "Sun",
};

/**
 * Best-effort conversion of arbitrary sheet date strings to ISO (YYYY-MM-DD).
 * Google Sheets has no date format enforcement so this handles what we know:
 *   "vr  1/5/26"  → Dutch with day abbreviation prefix
 *   "1/5/26"      → D/M/YY (European short)
 *   "01/05/2026"  → D/M/YYYY
 *   "2026-05-01"  → already ISO, pass through
 * Anything unrecognisable returns "" so the picker just shows empty.
 */
function tryParseToISO(raw: string): string {
  const s = raw.trim();
  if (!s) return "";

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Strip leading day abbreviation (e.g. "vr  ") then parse D/M/YY(YY)
  const parts = s.split(/\s+/);
  const datePart = parts[parts.length - 1] ?? "";
  const segs = datePart.split("/");
  if (segs.length === 3) {
    const d = Number(segs[0]);
    const m = Number(segs[1]);
    const y = Number(segs[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && !Number.isNaN(y)) {
      const year = y < 100 ? 2000 + y : y;
      return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // Last resort: let JS try (handles "May 1, 2026" etc.)
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()))
    return parsed.toISOString().split("T")[0];

  return "";
}

function parseDayTab(
  raw: string | null,
  i: number,
): { label: string; date: string | null } {
  if (!raw) return { label: `D${i + 1}`, date: null };
  const parts = raw.trim().split(/\s+/);
  const label = DUTCH_TO_EN[parts[0]?.toLowerCase() ?? ""] ?? `D${i + 1}`;
  const segs = (parts[parts.length - 1] ?? "").split("/");
  return { label, date: segs.length >= 2 ? `${segs[0]}/${segs[1]}` : null };
}

export const Route = createFileRoute("/_auth/$spreadsheetId")({
  validateSearch: z.object({ tab: z.string().optional() }),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ params, deps }): Promise<LoaderData> => {
    const allowed = await checkSpreadsheetAccess({
      data: { spreadsheetId: params.spreadsheetId },
    });
    if (!allowed) return { allowed: false };

    const meta = await getSpreadsheetMeta({
      data: { spreadsheetId: params.spreadsheetId },
    });
    const tab = deps.tab
      ? await getTabData({
          data: { spreadsheetId: params.spreadsheetId, tab: deps.tab },
        })
      : null;
    return { allowed: true, ...meta, tab };
  },
  component: SpreadsheetPage,
  errorComponent: ErrorDisplay,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function SpreadsheetPage() {
  const data = Route.useLoaderData() as LoaderData;
  if (!data.allowed) return <NotAllowed />;
  const { title, tabs, tab } = data;
  const { spreadsheetId } = Route.useParams();
  const { tab: selectedTab } = Route.useSearch();
  const navigate = useNavigate({ from: "/$spreadsheetId" });
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });

  const [activeDay, setActiveDay] = useState(0);
  const [weekValues, setWeekValues] = useState<WeekValues>({});
  const [weekLevelValues, setWeekLevelValues] = useState<WeekLevelValues>({});
  const [saving, setSaving] = useState(false);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selectedTab) {
      const saved = localStorage.getItem(lsKey(spreadsheetId));
      if (saved && tabs.includes(saved)) navigate({ search: { tab: saved } });
    }
  }, []);

  useEffect(() => {
    if (!tab) return;
    const initial: WeekValues = {};
    const initialWeekLevel: WeekLevelValues = {};
    for (let day = 0; day < 7; day++) {
      initial[day] = {};
      for (const section of tab.sections)
        for (const field of section.fields) {
          if (field.weekField) {
            if (day === 0) {
              initialWeekLevel[field.key] = field.values[0] ?? "";
            }
            continue;
          }
          let raw = field.values[day] ?? "";
          if (field.kind === "number" && raw) raw = raw.replace(",", ".");
          if (field.kind === "date" && raw) raw = tryParseToISO(raw);
          initial[day][field.key] = raw;
        }
    }
    setWeekValues(initial);
    setWeekLevelValues(initialWeekLevel);
    setActiveDay(0);
  }, [tab?.sheetName]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedTab]);

  function handleChange(key: string, value: string) {
    setWeekValues((prev) => ({
      ...prev,
      [activeDay]: { ...prev[activeDay], [key]: value },
    }));
  }

  function handleWeekLevelChange(key: string, value: string) {
    setWeekLevelValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!tab || saving) return;
    setSaving(true);
    try {
      const dayCol = 4 + activeDay; // dayStartColumn=4 (col E) + day offset
      const updates: { range: string; value: string }[] = [];

      // Per-day fields
      for (const section of tab.sections) {
        for (const field of section.fields) {
          if (field.weekField || field.rowIndex === null) continue;
          let value = weekValues[activeDay]?.[field.key] ?? "";
          if (field.kind === "date" && value) value = isoToDMYY(value);
          updates.push({
            range: a1Range(tab.sheetName, dayCol, field.rowIndex + 1),
            value,
          });
        }
      }

      // Week-level fields — always written to col E (dayStartColumn)
      for (const section of tab.sections) {
        for (const field of section.fields) {
          if (!field.weekField || field.rowIndex === null) continue;
          const value = weekLevelValues[field.key] ?? "";
          updates.push({
            range: a1Range(tab.sheetName, 4, field.rowIndex + 1),
            value,
          });
        }
      }

      await saveDay({ data: { spreadsheetId, updates } });
    } finally {
      setSaving(false);
    }
  }

  function handleWeekChange(t: string) {
    localStorage.setItem(lsKey(spreadsheetId), t);
    navigate({ search: { tab: t } });
  }

  const dayValues = weekValues[activeDay] ?? {};
  const activeDayMeta = tab
    ? parseDayTab(tab.dates[activeDay], activeDay)
    : null;

  return (
    <div className="min-h-screen bg-black font-mono text-zinc-100">
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="border border-zinc-800 px-10 py-6">
            <p className="animate-pulse text-[11px] uppercase tracking-widest text-zinc-500">
              loading…
            </p>
          </div>
        </div>
      )}

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-xs uppercase tracking-widest text-zinc-500">
            {title}
          </span>
          <span className="text-zinc-600">/</span>
          {tab ? (
            <span className="text-xs text-zinc-300">{tab.sheetName}</span>
          ) : (
            <span className="text-xs text-zinc-600">no week selected</span>
          )}
          <div className="ml-auto">
            <UserButton />
          </div>
        </div>

        {/* ── Week selector ─────────────────────────────────────────── */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const active = t === tab?.sheetName;
            return (
              <button
                key={t}
                ref={active ? activeTabRef : undefined}
                type="button"
                onClick={() => handleWeekChange(t)}
                className={`shrink-0 border px-3 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                  active
                    ? "border-zinc-400 bg-zinc-900 text-zinc-100"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="mx-auto max-w-lg px-4 pb-32 pt-6">
        {!tab ? (
          <p className="text-xs text-zinc-600">← select a week above</p>
        ) : (
          <>
            {/* Active day heading */}
            <div className="mb-6 border-b border-zinc-800 pb-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                day {activeDay + 1}
              </p>
              <h2 className="mt-0.5 text-xl text-zinc-100">
                {activeDayMeta?.label}
                {activeDayMeta?.date && (
                  <span className="ml-2 text-sm text-zinc-500">
                    {activeDayMeta.date}
                  </span>
                )}
              </h2>
            </div>

            {/* Per-day sections (exclude weekField fields) */}
            <div className="space-y-6">
              {tab.sections.map((section) => {
                const dayFields = section.fields.filter((f) => !f.weekField);
                if (!dayFields.length) return null;
                return (
                  <SectionCard
                    key={section.key}
                    section={{ ...section, fields: dayFields }}
                    values={dayValues}
                    onChange={handleChange}
                  />
                );
              })}
            </div>

            {/* Week-level fields (merged cells spanning all 7 days) */}
            {(() => {
              const weekFields = tab.sections.flatMap((s) =>
                s.fields.filter((f) => f.weekField),
              );
              if (!weekFields.length) return null;
              return (
                <div className="mt-8">
                  <p className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">
                    // this week
                  </p>
                  <div className="divide-y divide-zinc-900 border border-zinc-800">
                    {weekFields.map((field) => (
                      <FieldRow
                        key={field.key}
                        field={field}
                        value={weekLevelValues[field.key] ?? ""}
                        onChange={(v) => handleWeekLevelChange(field.key, v)}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Save */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-8 w-full border border-zinc-700 py-3 text-xs uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100 active:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "saving…" : `save day ${activeDay + 1}`}
            </button>
          </>
        )}
      </main>

      {/* ── Day tab bar ──────────────────────────────────────────────── */}
      {tab && (
        <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-black">
          <div className="mx-auto flex max-w-lg">
            {Array.from({ length: 7 }, (_, i) => {
              const { label, date } = parseDayTab(tab.dates[i], i);
              const active = i === activeDay;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveDay(i)}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-[10px] uppercase tracking-wide transition-colors ${
                    active
                      ? "-mt-px border-t border-zinc-400 text-zinc-100"
                      : "text-zinc-600 hover:text-zinc-500"
                  }`}
                >
                  <span>{label}</span>
                  {date && <span className="text-zinc-600">{date}</span>}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section card
// ---------------------------------------------------------------------------

function SectionCard({
  section,
  values,
  onChange,
}: {
  section: ParsedSection;
  values: DayValues;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">
        // {section.title}
      </p>
      <div className="divide-y divide-zinc-900 border border-zinc-800">
        {section.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(v) => onChange(field.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field row
// ---------------------------------------------------------------------------

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ParsedField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="px-3 py-3">
      <label className="mb-2 block text-[10px] uppercase tracking-widest text-zinc-500">
        {field.label}
        {field.unit && (
          <span className="ml-1 text-zinc-600">({field.unit})</span>
        )}
      </label>
      <FieldInput field={field} value={value} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field inputs
// ---------------------------------------------------------------------------

const inputBase =
  "w-full border border-zinc-800 bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-800 focus:border-zinc-600 focus:outline-none font-mono";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ParsedField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.kind === "rating") {
    const min = field.min ?? 1;
    const max = field.max ?? 5;
    return (
      <div className="flex gap-1.5">
        {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => {
          const active = String(n) === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? "" : String(n))}
              className={`flex h-10 flex-1 items-center justify-center border text-sm transition-colors ${
                active
                  ? "border-zinc-400 bg-zinc-900 text-zinc-100"
                  : "border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.kind === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase}
      />
    );
  }

  if (field.kind === "select") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase}
      >
        <option value="">—</option>
        {field.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "textarea") {
    return (
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={`${inputBase} resize-none`}
      />
    );
  }

  if (field.kind === "number") {
    return (
      <input
        type="number"
        value={value}
        step={field.step ?? 1}
        min={field.min}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={inputBase}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className={inputBase}
    />
  );
}

// ---------------------------------------------------------------------------
// Not allowed
// ---------------------------------------------------------------------------

function NotAllowed() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black font-mono">
      <div className="w-full max-w-sm border border-zinc-800 p-8">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
          // access denied
        </p>
        <p className="text-sm text-zinc-300">
          you don't have access to this tracker
        </p>
        <p className="mt-3 text-xs text-zinc-600">
          contact your coach to get access
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------

function ErrorDisplay({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black font-mono">
      <div className="w-full max-w-sm border border-zinc-800 p-8">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
          // error
        </p>
        <p className="text-sm text-zinc-300">failed to load spreadsheet</p>
        <p className="mt-3 break-words text-xs text-zinc-600">
          {error.message}
        </p>
      </div>
    </div>
  );
}
