"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useState, useTransition } from "react";
import { importContacts, type ImportResult } from "@/actions/import";

const FIELDS: { value: string; label: string; guess: RegExp }[] = [
  { value: "firstName", label: "First name", guess: /^(first|given|fname|first.?name)$/ },
  { value: "lastName", label: "Last name", guess: /^(last|surname|family|lname|last.?name)$/ },
  { value: "fullName", label: "Full name (split)", guess: /^(name|full.?name|contact|contact.?name)$/ },
  { value: "email", label: "Email", guess: /e-?mail/ },
  { value: "phone", label: "Phone", guess: /phone|mobile|cell|tel/ },
  { value: "title", label: "Job title", guess: /title|position|role/ },
  { value: "company", label: "Company", guess: /company|organi[sz]ation|account|business/ },
  { value: "source", label: "Lead source", guess: /source|channel|origin/ },
  { value: "lifecycle", label: "Lifecycle stage", guess: /status|stage|lifecycle/ },
  { value: "tags", label: "Tags", guess: /tags?|labels?|lists?/ },
];

export function Importer({ customFields }: { customFields: { key: string; label: string }[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<"skip" | "update">("skip");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function guess(h: string) {
    const n = h.trim().toLowerCase();
    const cf = customFields.find((f) => f.label.toLowerCase() === n || f.key === n);
    if (cf) return `cf:${cf.key}`;
    return FIELDS.find((f) => f.guess.test(n))?.value ?? `new:${h.trim()}`;
  }

  function onFile(file: File) {
    setResult(null);
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (!hs.length) return setError("Couldn't find a header row in that file.");
        if (res.data.length > 5000) return setError("Please import at most 5,000 rows at a time.");
        setFileName(file.name);
        setHeaders(hs);
        setRows(res.data);
        const used = new Set<string>();
        setMapping(
          Object.fromEntries(
            hs.map((h) => {
              let g = guess(h);
              if (!g.startsWith("new:") && used.has(g)) g = "ignore";
              used.add(g);
              return [h, g];
            }),
          ),
        );
      },
      error: (e) => setError(e.message),
    });
  }

  const mappedTargets = Object.values(mapping);
  const hasName = mappedTargets.some((t) => ["firstName", "fullName", "email"].includes(t));
  const preview = useMemo(() => rows.slice(0, 4), [rows]);

  if (result) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">✓</div>
        <h2 className="mt-4 text-lg font-semibold">Import complete</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {result.created} created · {result.updated} updated · {result.skipped} skipped
          {result.companies > 0 && ` · ${result.companies} new companies`}
        </p>
        {result.errors.length > 0 && (
          <ul className="mx-auto mt-4 max-w-md rounded-lg bg-amber-50 p-3 text-left text-xs text-amber-800">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/contacts" className="btn-primary">
            View contacts
          </Link>
          <button className="btn-secondary" onClick={() => (setResult(null), setHeaders([]), setRows([]), setFileName(null))}>
            Import another file
          </button>
        </div>
      </div>
    );
  }

  if (!headers.length) {
    return (
      <>
        <label
          className="card flex cursor-pointer flex-col items-center border-2 border-dashed px-6 py-16 text-center transition hover:border-brand/50 hover:bg-brand-soft/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
        >
          <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
            <Upload className="size-5" />
          </span>
          <span className="mt-4 font-medium">Drop a CSV file here, or click to choose</span>
          <span className="mt-1 text-sm text-zinc-500">Export from your old CRM or spreadsheet. Up to 5,000 rows.</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <p className="mt-4 text-sm text-zinc-500">
          Not sure about the format?{" "}
          <a href="/sample-contacts.csv" download className="font-medium text-brand hover:underline">
            Download a sample CSV
          </a>
          .
        </p>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="size-5 text-brand" />
          <div>
            <div className="text-sm font-medium">{fileName}</div>
            <div className="text-xs text-zinc-500">
              {rows.length} rows · {headers.length} columns
            </div>
          </div>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => (setHeaders([]), setRows([]))}>
          Choose a different file
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold">Map your columns</h2>
          <p className="text-xs text-zinc-500">We guessed based on the headers. Unknown columns become new custom fields unless you ignore them.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-zinc-50/60">
              <tr>
                <th className="table-th">Column in your file</th>
                <th className="table-th">Sample values</th>
                <th className="table-th w-64">Import as</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {headers.map((h) => (
                <tr key={h}>
                  <td className="table-td font-medium">{h}</td>
                  <td className="table-td max-w-xs truncate text-zinc-500">
                    {preview
                      .map((r) => r[h])
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(" · ") || "—"}
                  </td>
                  <td className="table-td">
                    <select
                      value={mapping[h]}
                      onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                      className={`input py-1.5 ${mapping[h] === "ignore" ? "text-zinc-400" : ""}`}
                    >
                      <option value="ignore">— Don&apos;t import —</option>
                      <optgroup label="Contact fields">
                        {FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                      {customFields.length > 0 && (
                        <optgroup label="Custom fields">
                          {customFields.map((f) => (
                            <option key={f.key} value={`cf:${f.key}`}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <option value={`new:${h}`}>+ New custom field “{h}”</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <label className="flex items-center gap-2 text-sm">
          If an email already exists:
          <select value={duplicates} onChange={(e) => setDuplicates(e.target.value as "skip" | "update")} className="input w-auto py-1.5">
            <option value="skip">Skip the row</option>
            <option value="update">Update the existing contact</option>
          </select>
        </label>
        <div className="flex items-center gap-3">
          {!hasName && <span className="text-xs text-red-600">Map a name or email column first.</span>}
          <button
            className="btn-primary"
            disabled={!hasName || pending}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  setResult(await importContacts({ mapping, rows, duplicates }));
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Import failed");
                }
              })
            }
          >
            {pending ? "Importing…" : `Import ${rows.length} contacts`}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
