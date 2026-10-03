import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, parsePhysicalRooms, groupByAddress, normalizeType, parseTitle, suggestNumbers, matchProperty } from "./wp-rooms";

const csv = readFileSync(join(__dirname, "__fixtures__/zimmers.csv"), "utf8");

describe("wp room import parser", () => {
  it("parses multi-line quoted fields", () => {
    const rows = parseCsv('\uFEFFID,Content\n1,"<p>a\nb ""c""</p>"\n2,x\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].Content).toBe('<p>a\nb "c"</p>');
  });

  it("finds 84 physical rooms in 10 address groups", () => {
    const rooms = parsePhysicalRooms(csv);
    expect(rooms).toHaveLength(84);
    const groups = groupByAddress(rooms);
    expect(groups).toHaveLength(10);
    const counts = Object.fromEntries(groups.map((g) => [`${g.city} ${g.street}`, g.rooms.length]));
    expect(counts["Bielefeld Paderborner Str."]).toBe(29);
    expect(counts["Bünde Borriestr."]).toBe(13);
    expect(counts["Löhne Löhnerstr."]).toBe(9);
    expect(counts["Preußisch Oldendorf Goethestr."]).toBe(5);
    expect(counts["Osnabrück Klarastr."]).toBe(5);
  });

  it("recognises every room type and keeps bath/shower variants separate", () => {
    expect(parsePhysicalRooms(csv).every((r) => r.type)).toBe(true);
    expect(normalizeType("Einzelzimmer mit eigenem Bad")?.code).toBe("EZ-BAD");
    expect(normalizeType("Einzelzimmer mit eigener Dusche")?.code).toBe("EZ-DU");
    expect(normalizeType("Familienzimmer mit eigenem Bad")?.capacity).toBeNull();
    expect(normalizeType("Ferienwohnung")?.capacity).toBeNull();
    expect(normalizeType("Dreibettzimmer")?.capacity).toBe(3);
  });

  it("reads city/street/number variants", () => {
    expect(parseTitle("Dreibettzimmer in Löhne 02-Löhnerstr.")).toMatchObject({ city: "Löhne", street: "Löhnerstr.", numberHint: "02" });
    expect(parseTitle("Doppelzimmer in Bünde 01 (Semmelweg)")).toMatchObject({ city: "Bünde", street: "Semmelweg", numberHint: "01" });
    expect(parseTitle("Einzelzimmer in Löhne (Löhnerstr.)").numberHint).toBeNull();
  });

  it("suggests unique numbers per property and flags guesses", () => {
    for (const g of groupByAddress(parsePhysicalRooms(csv))) {
      const s = suggestNumbers(g.rooms);
      expect(new Set([...s.values()].map((v) => v.number)).size).toBe(g.rooms.length);
    }
  });

  it("matches existing properties by city and street", () => {
    const props = [{ id: "1", name: "Pension Bünde — Carl-Diem-Str." }, { id: "2", name: "Pension Bünde — Borriestr." }];
    expect(matchProperty({ city: "Bünde", street: "Carl-Diem Str." }, props)?.id).toBe("1");
    expect(matchProperty({ city: "Bünde", street: "Semmelweg" }, props)).toBeNull();
  });
});
