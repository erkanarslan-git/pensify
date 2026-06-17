// Tiny iCal generator + parser (no external deps) for channel sync.
// Spec subset: VEVENT with DTSTART;VALUE=DATE / DTEND;VALUE=DATE / SUMMARY / UID.

export type ICalEvent = {
  uid: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (exclusive)
  summary?: string;
};

function fmtDate(d: string) {
  return d.replace(/-/g, "");
}

export function buildICal(opts: { calName: string; events: ICalEvent[] }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pensify//Channel Sync//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${opts.calName}`,
  ];
  for (const e of opts.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;VALUE=DATE:${fmtDate(e.start)}`,
      `DTEND;VALUE=DATE:${fmtDate(e.end)}`,
      `SUMMARY:${(e.summary ?? "Reserved").replace(/[\r\n,;]/g, " ")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function parseICal(text: string): ICalEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events: ICalEvent[] = [];
  let cur: Partial<ICalEvent> | null = null;
  for (const raw of unfolded.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur?.uid && cur.start && cur.end) events.push(cur as ICalEvent);
      cur = null;
    } else if (cur) {
      const [key, ...rest] = line.split(":");
      const val = rest.join(":");
      const k = key.split(";")[0];
      if (k === "UID") cur.uid = val;
      else if (k === "SUMMARY") cur.summary = val;
      else if (k === "DTSTART") cur.start = isoFromICal(val);
      else if (k === "DTEND") cur.end = isoFromICal(val);
    }
  }
  return events;
}

function isoFromICal(v: string) {
  const d = v.length >= 8 ? v.slice(0, 8) : v;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
