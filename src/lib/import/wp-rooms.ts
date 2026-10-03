// Pure, browser-safe parsing of WordPress (phb_room) exports. No DB access here.

/** RFC 4180 CSV parser: quoted fields, escaped quotes, multi-line values, BOM. */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v !== "")) rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export interface TypeDef { name: string; code: string; capacity: number | null }

const BASES: [RegExp, string, string, number | null][] = [
  [/^einzelzimmer/i, "Einzelzimmer", "EZ", 1],
  [/^doppelzimmer/i, "Doppelzimmer", "DZ", 2],
  [/^dreibettzimmer/i, "Dreibettzimmer", "3BZ", 3],
  [/^vierbettzimmer/i, "Vierbettzimmer", "4BZ", 4],
  [/^familienzimmer/i, "Familienzimmer", "FZ", null],
  [/^ferienwohnung/i, "Ferienwohnung", "FEWO", null],
];

/** Normalize the type part of a title ("Doppelzimmer mit eigenem Bad"). Unknown → null. */
export function normalizeType(raw: string): TypeDef | null {
  const s = raw.trim();
  const base = BASES.find(([re]) => re.test(s));
  if (!base) return null;
  const [, name, code, capacity] = base;
  if (/mit eigenem bad/i.test(s)) return { name: `${name} mit eigenem Bad`, code: `${code}-BAD`, capacity };
  if (/mit eigener dusche/i.test(s)) return { name: `${name} mit eigener Dusche`, code: `${code}-DU`, capacity };
  return { name, code, capacity };
}

export interface ParsedRoom {
  externalId: string;
  title: string;
  url: string;
  typeRaw: string;
  type: TypeDef | null;
  city: string;
  street: string;
  addressKey: string;
  numberHint: string | null; // "01", "02" from title – suggestion only
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss").replace(/strasse|straße/g, "str").replace(/[^a-z0-9]/g, "");

/** "Doppelzimmer in Bünde 01 (Semmelweg)", "Dreibettzimmer in Löhne 02-Löhnerstr." */
export function parseTitle(title: string): Omit<ParsedRoom, "externalId" | "url"> {
  const idx = title.search(/\sin\s/i);
  const typeRaw = idx >= 0 ? title.slice(0, idx) : title;
  let rest = idx >= 0 ? title.slice(idx + 4).trim() : "";
  const numbers = rest.match(/\b\d{2}\b/g);
  const numberHint = numbers ? numbers[numbers.length - 1] : null;
  let street = "";
  const paren = rest.match(/\(([^)]+)\)/);
  if (paren) { street = paren[1]; rest = rest.replace(paren[0], " "); }
  else {
    const dash = rest.match(/\d{2}\s*-\s*(.+)$/);
    if (dash) { street = dash[1]; rest = rest.slice(0, dash.index); }
  }
  const city = rest.replace(/\b\d{2}\b/g, " ").replace(/[-\s]+$/, "").replace(/\s+/g, " ").trim();
  street = street.replace(/\s+/g, " ").trim();
  street = street.charAt(0).toUpperCase() + street.slice(1);
  return { title, typeRaw, type: normalizeType(typeRaw), city, street, addressKey: `${norm(city)}-${norm(street)}`, numberHint };
}

export function parsePhysicalRooms(csvText: string): ParsedRoom[] {
  return parseCsv(csvText)
    .filter((r) => r["ID"] && r["Title"])
    .map((r) => ({ externalId: r["ID"], url: r["Permalink"] ?? "", ...parseTitle(r["Title"]) }));
}

export interface AddressGroup { key: string; city: string; street: string; rooms: ParsedRoom[] }

export function groupByAddress(rooms: ParsedRoom[]): AddressGroup[] {
  const map = new Map<string, AddressGroup>();
  for (const r of rooms) {
    const g = map.get(r.addressKey) ?? { key: r.addressKey, city: r.city, street: r.street, rooms: [] };
    g.rooms.push(r);
    map.set(r.addressKey, g);
  }
  return [...map.values()].sort((a, b) => a.city.localeCompare(b.city, "de") || a.street.localeCompare(b.street, "de"));
}

/** Suggest an existing property whose name contains both city and street. */
export function matchProperty<T extends { id: string; name: string }>(g: { city: string; street: string }, props: T[]): T | null {
  const c = norm(g.city); const s = norm(g.street);
  return props.find((p) => { const n = norm(p.name); return n.includes(c) && n.includes(s); }) ?? null;
}

/** Suggested room number unique per property: "<CODE>-<NN>". Always editable. */
export function suggestNumbers(rooms: ParsedRoom[]): Map<string, { number: string; guessed: boolean }> {
  const out = new Map<string, { number: string; guessed: boolean }>();
  const used = new Set<string>();
  const sorted = [...rooms].sort((a, b) => (a.numberHint ?? "99").localeCompare(b.numberHint ?? "99"));
  for (const r of sorted) {
    const code = r.type?.code ?? "ZI";
    let n = r.numberHint ? `${code}-${r.numberHint}` : "";
    const guessed = !r.numberHint || used.has(n);
    if (!n || used.has(n)) {
      let i = 1;
      do { n = `${code}-${String(i).padStart(2, "0")}`; i++; } while (used.has(n));
    }
    used.add(n);
    out.set(r.externalId, { number: n, guessed });
  }
  return out;
}

/** Listing pages export (phb_room_type): only counted for information, never imported 1:1. */
export function parseListings(csvText: string): { id: string; title: string }[] {
  return parseCsv(csvText).filter((r) => r["ID"] && r["Title"]).map((r) => ({ id: r["ID"], title: r["Title"] }));
}
