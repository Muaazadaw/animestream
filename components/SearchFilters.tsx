"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SEARCH_FILTER_KEYS } from "@/lib/anilist";
import { Icon } from "./Menu";

export type FilterValues = Record<string, string>;
type Option = { value: string; label: string; group?: string };


function MultiSelect({
  label,
  options,
  value,
  onChange,
  searchable,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const text = value.length === 0 ? label : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? value[0] : `${label} · ${value.length}`;

  return (
    <div className={`fsel ${open ? "is-open" : ""} ${value.length ? "is-set" : ""}`} ref={ref}>
      <button type="button" className="fsel__btn" onClick={() => setOpen(!open)}>
        <span>{text}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open ? (
        <div className="fsel__pop">
          {searchable ? <input autoFocus className="fsel__search" placeholder={`Find ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} /> : null}
          {value.length ? (
            <button type="button" className="fsel__clear" onClick={() => onChange([])}>
              Clear {value.length} selected
            </button>
          ) : null}
          <div className="fsel__list">
            {shown.map((o, i) => (
              <div key={o.value}>
                {o.group && o.group !== shown[i - 1]?.group && !q ? <div className="fsel__group">{o.group}</div> : null}
                <label className="fsel__opt">
                  <input
                    type="checkbox"
                    checked={value.includes(o.value)}
                    onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
                  />
                  {o.label}
                </label>
              </div>
            ))}
            {shown.length === 0 ? <p className="fsel__none">No matches.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Select({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className={`fsel fsel--native ${value ? "is-set" : ""}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron" size={14} />
    </label>
  );
}

export default function SearchFilters({
  values,
  genres,
  tags,
  formats,
  statuses,
  sorts,
  sources,
  countries,
  seasons,
  years,
}: {
  values: FilterValues;
  genres: Option[];
  tags: Option[];
  formats: Option[];
  statuses: Option[];
  sorts: Option[];
  sources: Option[];
  countries: Option[];
  seasons: Option[];
  years: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(true);
  const list = (k: string) => (values[k] ? values[k].split(",").filter(Boolean) : []);

  function apply(next: FilterValues) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && k !== "page") qs.set(k, v);
    startTransition(() => router.push(`${pathname}${qs.size ? `?${qs}` : ""}`, { scroll: false }));
  }
  const set = (k: string, v: string) => apply({ ...values, [k]: v });
  const setList = (k: string, v: string[]) => set(k, v.join(","));
  const active = SEARCH_FILTER_KEYS.some((k) => values[k]);

  return (
    <div className={`sfilters ${pending ? "is-pending" : ""}`}>
      <div className="sfilters__row">
        <MultiSelect label="Genres" options={genres} value={list("genres")} onChange={(v) => setList("genres", v)} />
        <MultiSelect label="Tags" options={tags} value={list("tags")} onChange={(v) => setList("tags", v)} searchable />
        <MultiSelect label="Formats" options={formats} value={list("formats")} onChange={(v) => setList("formats", v)} />
        <Select label="Status" options={statuses} value={values.status ?? ""} onChange={(v) => set("status", v)} />
        <Select label="Year" options={years} value={values.year ?? ""} onChange={(v) => set("year", v)} />
        <Select label="Most popular" options={sorts} value={values.sort ?? ""} onChange={(v) => set("sort", v)} />
        <div className="sfilters__tools">
          <button
            type="button"
            className="sfilters__tool"
            title="Reset filters"
            disabled={!active}
            onClick={() => apply({ q: values.q ?? "", type: values.type ?? "" })}
          >
            <Icon name="rewatch" size={15} />
          </button>
          <button type="button" className="sfilters__tool" title={expanded ? "Fewer filters" : "More filters"} onClick={() => setExpanded(!expanded)}>
            <span style={{ display: "inline-flex", transform: expanded ? "rotate(180deg)" : undefined }}>
              <Icon name="chevron" size={15} />
            </span>
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="sfilters__row">
          <Select label="Source" options={sources} value={values.source ?? ""} onChange={(v) => set("source", v)} />
          <Select label="Country" options={countries} value={values.country ?? ""} onChange={(v) => set("country", v)} />
          <Select
            label="Score"
            options={[90, 80, 70, 60, 50].map((n) => ({ value: String(n), label: `${n}%+` }))}
            value={values.score ?? ""}
            onChange={(v) => set("score", v)}
          />
          {seasons.length ? (
            <Select label="Season" options={seasons} value={values.season ?? ""} onChange={(v) => set("season", v)} />
          ) : null}
          <span className="sfilters__note">Non-adult only</span>
        </div>
      ) : null}
    </div>
  );
}
