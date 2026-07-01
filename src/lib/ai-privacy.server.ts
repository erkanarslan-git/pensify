import type { SupabaseClient } from "@supabase/supabase-js";

// Anonymization layer for the AI assistant.
// Purpose: real guest / staff / property / city names are never sent to the
// external LLM. The model only sees stable pseudonym tokens like PSN_G01,
// PSN_P02, PSN_C03, PSN_K04. Tool inputs are de-anonymized before hitting
// the database, tool outputs are anonymized before returning, and the final
// assistant text is de-anonymized before being shown to the user.

export type PrivacyMap = {
  anonymizeText: (s: string) => string;
  deanonymizeText: (s: string) => string;
  anonymizeJson: <T>(v: T) => T;
  deanonymizeJson: <T>(v: T) => T;
  tokenGlossary: () => string;
  resolveName: (nameOrToken: string) => string | null;
};

type Entry = { token: string; real: string; kind: "G" | "P" | "C" | "K" };

const STOPWORDS = new Set([
  "the","and","der","die","das","und","von","ve","ile","icin","için","bir","de","da",
]);

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function buildPrivacyMap(supabase: SupabaseClient): Promise<PrivacyMap> {
  const [propsRes, citiesRes, cleanersRes, resvRes] = await Promise.all([
    supabase.from("properties").select("name"),
    supabase.from("cities").select("name"),
    supabase.from("cleaners").select("name"),
    supabase.from("reservations").select("guest_name").not("guest_name", "is", null),
  ]);

  const entries: Entry[] = [];
  const seen = new Set<string>();
  const addEntry = (real: string, kind: Entry["kind"], idx: number) => {
    const key = `${kind}:${real.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ real, kind, token: `PSN_${kind}${String(idx).padStart(2, "0")}` });
  };

  (propsRes.data ?? []).forEach((r: any, i) => r?.name && addEntry(String(r.name), "P", i + 1));
  (citiesRes.data ?? []).forEach((r: any, i) => r?.name && addEntry(String(r.name), "C", i + 1));
  (cleanersRes.data ?? []).forEach((r: any, i) => r?.name && addEntry(String(r.name), "K", i + 1));

  const guestSet = new Map<string, string>(); // lower → original
  for (const r of (resvRes.data ?? []) as any[]) {
    const n = String(r?.guest_name ?? "").trim();
    if (n && !guestSet.has(n.toLowerCase())) guestSet.set(n.toLowerCase(), n);
  }
  let gi = 1;
  for (const original of guestSet.values()) addEntry(original, "G", gi++);

  // Build alias index: full name AND individual words (first/last) mapping to
  // the same token, so a user can type "Erkan" and match "Erkan Arslan".
  // Skip stopwords and words shorter than 3 chars. If a word would map to
  // multiple entries, drop that alias (ambiguous).
  const aliasToToken = new Map<string, string>(); // lowercased alias → token
  const conflicts = new Set<string>();
  const tokenToReal = new Map<string, string>();

  for (const e of entries) {
    tokenToReal.set(e.token, e.real);
    const parts = [e.real, ...e.real.split(/\s+/)];
    for (const p of parts) {
      const key = p.toLowerCase().trim();
      if (!key || key.length < 3 || STOPWORDS.has(key)) continue;
      if (aliasToToken.has(key) && aliasToToken.get(key) !== e.token) {
        conflicts.add(key);
      } else {
        aliasToToken.set(key, e.token);
      }
    }
  }
  for (const c of conflicts) aliasToToken.delete(c);

  // Anonymization regex: sort aliases longest first so "Erkan Arslan" wins
  // over "Erkan".
  const aliases = Array.from(aliasToToken.keys()).sort((a, b) => b.length - a.length);
  const anonRegex = aliases.length
    ? new RegExp(`\\b(${aliases.map(escapeRegExp).join("|")})\\b`, "gi")
    : null;

  const tokenRegex = /PSN_[GPCK]\d{2,}/g;

  const anonymizeText = (s: string) => {
    if (!s || !anonRegex) return s;
    return s.replace(anonRegex, (m) => aliasToToken.get(m.toLowerCase()) ?? m);
  };
  const deanonymizeText = (s: string) => {
    if (!s) return s;
    return s.replace(tokenRegex, (m) => tokenToReal.get(m) ?? m);
  };

  const walk = (v: any, fn: (s: string) => string): any => {
    if (v == null) return v;
    if (typeof v === "string") return fn(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, fn));
    if (typeof v === "object") {
      const out: any = {};
      for (const k of Object.keys(v)) out[k] = walk(v[k], fn);
      return out;
    }
    return v;
  };

  return {
    anonymizeText,
    deanonymizeText,
    anonymizeJson: (v) => walk(v, anonymizeText),
    deanonymizeJson: (v) => walk(v, deanonymizeText),
    resolveName: (n: string) => {
      if (!n) return null;
      const key = n.trim();
      if (tokenToReal.has(key)) return tokenToReal.get(key)!;
      const alias = aliasToToken.get(key.toLowerCase());
      if (alias) return tokenToReal.get(alias) ?? null;
      return null;
    },
    tokenGlossary: () => {
      const counts = { G: 0, P: 0, C: 0, K: 0 };
      for (const e of entries) counts[e.kind]++;
      return `Sistemdeki kayıtlar için gizlilik kodları: ${counts.G} misafir (PSN_G##), ${counts.P} pansiyon (PSN_P##), ${counts.C} şehir (PSN_C##), ${counts.K} personel (PSN_K##).`;
    },
  };
}
