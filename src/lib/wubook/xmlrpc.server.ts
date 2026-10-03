// WuBook Wired XML-RPC transport. Server-only.
// Security: the request body contains the permanent token — never log it,
// never return raw XML to callers. Parsing rejects DTD/ENTITY/PI to block
// XXE and external resource loading.

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 512 * 1024;

export class XmlRpcError extends Error {
  constructor(
    message: string,
    public code: "timeout" | "http" | "malformed" | "too_large" | "fault",
  ) {
    super(message);
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function valueXml(value: unknown): string {
  if (typeof value === "boolean") return `<boolean>${value ? 1 : 0}</boolean>`;
  if (typeof value === "number" && Number.isInteger(value)) return `<int>${value}</int>`;
  if (typeof value === "string") return `<string>${escapeXml(value)}</string>`;
  if (Array.isArray(value)) return `<array><data>${value.map((v) => `<value>${valueXml(v)}</value>`).join("")}</data></array>`;
  if (value && typeof value === "object") {
    return `<struct>${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `<member><name>${escapeXml(k)}</name><value>${valueXml(v)}</value></member>`)
      .join("")}</struct>`;
  }
  throw new XmlRpcError("unsupported_param", "fault");
}

function paramXml(value: unknown): string {
  if (value === undefined || value === null) throw new XmlRpcError("unsupported_param", "fault");
  return `<param><value>${valueXml(value)}</value></param>`;
}

export function buildRequest(method: string, params: unknown[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>${escapeXml(method)}</methodName><params>${params.map(paramXml).join("")}</params></methodCall>`;
}

// ---- Minimal safe XML-RPC response parser (no DTD, no entities, no PI) ----

function assertSafeXml(xml: string): void {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<!\[CDATA\[<|xmlns\s*=\s*["']https?:/i.test(xml)) {
    throw new XmlRpcError("unsafe_xml", "malformed");
  }
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function parseValue(xml: string): unknown {
  const trimmed = xml.trim();
  const m = trimmed.match(/^<(\w+)>([\s\S]*)<\/\1>$/);
  if (!m) return unescapeXml(trimmed); // bare text = string
  const [, tag, inner] = m;
  switch (tag) {
    case "int":
    case "i4":
      return parseInt(inner, 10);
    case "double":
      return parseFloat(inner);
    case "boolean":
      return inner.trim() === "1";
    case "string":
      return unescapeXml(inner);
    case "array": {
      const data = inner.match(/<data>([\s\S]*)<\/data>/)?.[1] ?? "";
      return splitTopLevel(data, "value").map(parseValue);
    }
    case "struct": {
      const out: Record<string, unknown> = {};
      for (const member of splitTopLevel(inner, "member")) {
        const name = member.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? "";
        const val = member.match(/<value>([\s\S]*)<\/value>/)?.[1] ?? "";
        out[unescapeXml(name)] = parseValue(val);
      }
      return out;
    }
    default:
      return unescapeXml(inner);
  }
}

// Split XML into top-level elements with the given tag (handles nesting).
function splitTopLevel(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}>`);
  let i = 0;
  while (i < xml.length) {
    re.lastIndex = i;
    const start = xml.indexOf(`<${tag}>`, i);
    if (start === -1) break;
    let depth = 1;
    let j = start + tag.length + 2;
    while (j < xml.length && depth > 0) {
      const nextOpen = xml.indexOf(`<${tag}>`, j);
      const nextClose = xml.indexOf(`</${tag}>`, j);
      if (nextClose === -1) throw new XmlRpcError("unbalanced_xml", "malformed");
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        j = nextOpen + tag.length + 2;
      } else {
        depth--;
        if (depth === 0) out.push(xml.slice(start + tag.length + 2, nextClose));
        j = nextClose + tag.length + 3;
      }
    }
    i = j;
  }
  return out;
}

export function parseResponse(xml: string): unknown {
  assertSafeXml(xml);
  const faultInner = xml.match(/<fault>([\s\S]*)<\/fault>/)?.[1];
  if (faultInner !== undefined) {
    const fVal = splitTopLevel(faultInner, "value")[0];
    const f = (fVal !== undefined ? parseValue(fVal) : {}) as Record<string, unknown>;
    throw new XmlRpcError(`xmlrpc_fault_${f?.faultCode ?? "unknown"}`, "fault");
  }
  const paramsInner = xml.match(/<params>([\s\S]*)<\/params>/)?.[1];
  if (paramsInner === undefined) throw new XmlRpcError("no_response_param", "malformed");
  const firstParam = splitTopLevel(paramsInner, "param")[0];
  if (firstParam === undefined) throw new XmlRpcError("no_response_param", "malformed");
  const valueInner = splitTopLevel(firstParam, "value")[0];
  if (valueInner === undefined) throw new XmlRpcError("no_response_param", "malformed");
  return parseValue(valueInner);
}

export interface XmlRpcTransportOptions {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export async function callXmlRpc(
  method: string,
  params: unknown[],
  opts: XmlRpcTransportOptions,
): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(opts.url, {
      method: "POST",
      headers: { "content-type": "text/xml; charset=utf-8" },
      body: buildRequest(method, params),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new XmlRpcError("request_timeout", "timeout");
    throw new XmlRpcError("network_error", "http");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new XmlRpcError(`http_${res.status}`, "http");

  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new XmlRpcError("response_too_large", "too_large");
  const text = await res.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new XmlRpcError("response_too_large", "too_large");
  }
  return parseResponse(text);
}
