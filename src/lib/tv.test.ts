import { describe, expect, it } from "vitest";
import { newTvEvents, tvDeltas, tvSnapshotSchema, tvTokenSchema, tvUpdate, tvMetricValues, nextTvPage, tvLocationLayout, TV_DELTA_MS, TV_CELEBRATION_MS, type TvSnapshot } from "./tv";

const event = { id: "event-1", at: "2026-10-23T00:00:00Z", kind: "reservation_created" as const, source: "booking", location: "Bünde", eligible: true };
const totals = { total: 84, occupied: 3, ready: 78, cleaning: 3, maintenance: 0, arrivals: 2, departures: 1, created: 1 };
const snapshot: TvSnapshot = { rotationSeconds: 10, priorityDetails: [], metrics: {created:1,automatic:0,manual:1,unknownOrigin:0,cleaned:18,review:3,maintenanceDone:4,maintenanceOpen:2,arrived:1,arrivalExpected:1,departed:0,departureExpected:1}, priorities:{arrivalNotReady:1,cleaningPriority:1,dueOpen:0,maintenanceBlocking:0}, organization: "Test", at: event.at, day: "2026-10-23", totals, properties: [], weekly: [], events: [event], dues: { overdue: 0, dueToday: 0, dueWeek: 0,paid:0,partial:0,open:0 }, today:{cleaningTotal:0,cleaningDone:0,todosTotal:0,todosDone:0,issuesOpen:0,issuesResolved:0}, colors: { booking: "#003580" } };
describe("TV safety and updates", () => {
  it("rejects personal fields in the response", () => {
    expect(tvSnapshotSchema.safeParse({ ...snapshot, guest_name: "private" }).success).toBe(false);
    expect(tvSnapshotSchema.safeParse({ ...snapshot, events: [{ ...event, guest_phone: "private" }] }).success).toBe(false);
    expect(tvSnapshotSchema.safeParse({ ...snapshot, properties: [{ name: "Test", ...totals, access_code: "private" }] }).success).toBe(false);
    expect(tvSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
  it("never sounds initial or reconnect snapshots", () => {
    expect(newTvEvents(null, [event])).toEqual([]);
    expect(newTvEvents([], [event], true)).toEqual([]);
  });
  it("deduplicates IDs and ignores previously seen events", () => {
    expect(newTvEvents([], [event, event])).toHaveLength(1);
    expect(newTvEvents([event.id], [event])).toEqual([]);
  });
  it("uses last snapshot changes, not period comparisons", () => {
    expect(tvDeltas(totals, { ...totals, ready: 79, cleaning: 2 })).toMatchObject({ ready: 1, cleaning: -1, occupied: 0 });
    expect(tvDeltas(null, totals).ready).toBe(0);
  });
  it("accepts only the full display token", () => {
    expect(tvTokenSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(tvTokenSchema.safeParse("a".repeat(63)).success).toBe(false);
    expect(tvTokenSchema.safeParse("https://outside.test").success).toBe(false);
  });
});
describe("Approved TV invariants",()=>{
 const later = {...snapshot,at:"2026-10-23T00:00:10Z",events:[{...event,id:"new",at:"2026-10-23T00:00:05Z"}],metrics:{...snapshot.metrics,created:4,cleaned:19}};
 it("daily cards use completions not dirty or blocked room counts",()=>{expect(tvMetricValues(snapshot)).toMatchObject({cleaned:18,maintenanceDone:4,ready:78});});
 it("first load never generates delta or celebration",()=>{expect(tvUpdate(null,later).celebrations).toEqual([]);expect(tvUpdate(null,later).deltas.cleaned).toBe(0);});
 it("day rollover establishes baseline",()=>{expect(tvUpdate(snapshot,{...later,day:"2026-10-24"}).deltas.created).toBe(0);expect(tvUpdate(snapshot,{...later,day:"2026-10-24"}).celebrations).toEqual([]);});
 it("reconnect establishes a silent baseline",()=>{expect(tvUpdate(snapshot,later,true).deltas.created).toBe(0);expect(tvUpdate(snapshot,later,true).celebrations).toEqual([]);});
 it("old snapshots never produce deltas",()=>{expect(tvUpdate(later,snapshot).deltas.cleaned).toBe(0);expect(tvUpdate(later,snapshot).celebrations).toEqual([]);});
 it("stale connections do not replay",()=>{expect(tvUpdate(snapshot,{...later,at:"2026-10-23T00:02:00Z"}).celebrations).toEqual([]);});
 it("unseen old event is not a new reservation",()=>{expect(tvUpdate(snapshot,{...later,events:[{...event,id:"old",at:"2026-10-22T23:59:00Z"}]}).celebrations).toEqual([]);});
 it("imports cannot celebrate",()=>{expect(tvUpdate(snapshot,{...later,events:later.events.map(e=>({...e,eligible:false}))}).celebrations).toEqual([]);});
 it("updates cannot celebrate",()=>{expect(tvUpdate(snapshot,{...later,events:later.events.map(e=>({...e,kind:"reservation_updated" as const}))}).celebrations).toEqual([]);});
 it("fresh booking dedupe groups one result",()=>{expect(tvUpdate(snapshot,{...later,events:[...later.events,...later.events]}).celebrations).toHaveLength(1);});
 it("repeated snapshots and page changes have no delta",()=>{expect(tvUpdate(later,later).deltas.created).toBe(0);expect(tvUpdate(later,later).celebrations).toEqual([]);});
 it("last verified increase is +3",()=>{expect(tvUpdate(snapshot,later).deltas.created).toBe(3);});
 it("decrease uses signed delta",()=>{expect(tvUpdate(later,{...later,at:"2026-10-23T00:00:20Z",metrics:{...later.metrics,cleaned:18}}).deltas.cleaned).toBe(-1);});
 it("delta expires at 8 seconds",()=>{expect(TV_DELTA_MS).toBe(8000);});
 it("celebration expires at 7 seconds",()=>{expect(TV_CELEBRATION_MS).toBe(7000);});
 it("new booking card may carry room and stay dates only",()=>{expect(tvSnapshotSchema.safeParse({...snapshot,events:[{...event,room:"101",checkIn:"2026-11-01",checkOut:"2026-11-04"}]}).success).toBe(true);expect(tvSnapshotSchema.safeParse({...snapshot,events:[{...event,room:"101",guest:"Max"}]}).success).toBe(false);});
 it("rotation wraps last to first",()=>{expect(nextTvPage(1,2)).toBe(0);});
 it("single-page rotation stays put",()=>{expect(nextTvPage(0,1)).toBe(0);});
 it("only approved intervals are valid",()=>{for(const rotationSeconds of [5,10,15,20])expect(tvSnapshotSchema.safeParse({...snapshot,rotationSeconds}).success).toBe(true);expect(tvSnapshotSchema.safeParse({...snapshot,rotationSeconds:3}).success).toBe(false);});
 it("missing metrics are an error not zero",()=>{expect(tvSnapshotSchema.safeParse({...snapshot,metrics:undefined}).success).toBe(false);});
});
describe("Balanced location rotation", () => {
 it("splits ten locations five and five even at a three-row capacity", () => {
  expect(tvLocationLayout(10, 3)).toEqual({ pages: 2, slots: 5 });
 });
 it("splits eight locations four and four", () => {
  expect(tvLocationLayout(8, 3)).toEqual({ pages: 2, slots: 4 });
 });
 it("uses one full page when all locations fit", () => {
  expect(tvLocationLayout(10, 10)).toEqual({ pages: 1, slots: 10 });
 });
 it("keeps odd pages within one item and never loses a location", () => {
  const { pages, slots } = tvLocationLayout(9, 2);
  expect(pages).toBe(2); expect(slots).toBe(5);
  const items = Array.from({length:9}, (_,i)=>i);
  expect([items.slice(0,slots).length,items.slice(slots).length]).toEqual([5,4]);
 });
});

describe("TV count reconciliation",()=>{
 it("rejects four daily reservations when origin counts explain only one",()=>{expect(tvSnapshotSchema.safeParse({...snapshot,metrics:{...snapshot.metrics,created:4}}).success).toBe(false);});
 it("accepts three payment periods split paid partial and open",()=>{expect(tvSnapshotSchema.safeParse({...snapshot,dues:{...snapshot.dues,dueToday:3,paid:1,partial:1,open:1}}).success).toBe(true);});
 it("rejects missing payment state for a due period",()=>{expect(tvSnapshotSchema.safeParse({...snapshot,dues:{...snapshot.dues,dueToday:3,paid:1,partial:1,open:0}}).success).toBe(false);});
 it("priority details never contain room or guest identities",()=>{expect(tvSnapshotSchema.safeParse({...snapshot,priorityDetails:[{location:"Bünde",arrivalNotReady:1,cleaningPriority:1,dueOpen:0,maintenanceBlocking:0,guest_name:"private"}]}).success).toBe(false);});
});

import { tvStateDeltas } from "./tv";
describe("live-state badges only", () => {
 const base = {...snapshot, totals:{...totals,total:200,occupied:100,ready:100}};
 const changed = {...base, at:"2026-10-23T00:00:10Z", totals:{...base.totals,occupied:101,ready:99},metrics:{...base.metrics,created:2,manual:2}};
 it("50 percent gains 0.5 percentage points for one of 200 rooms",()=>{expect(tvStateDeltas(base,changed).occupied).toBe(0.5);});
 it("one fewer ready room shows minus one",()=>{expect(tvStateDeltas(base,changed).ready).toBe(-1);});
 it("daily counters never get badges",()=>{expect(Object.keys(tvStateDeltas(base,changed))).toEqual(["occupied","ready"]);});
 it("booking alone does not change physical occupancy or readiness",()=>{expect(tvStateDeltas(base,{...changed,totals:base.totals})).toEqual({occupied:0,ready:0});});
 it("uses each snapshot denominator",()=>{expect(tvStateDeltas(base,{...changed,totals:{...base.totals,total:250}}).occupied).toBe(-10);});
 it("zero rooms produce a finite change",()=>{expect(tvStateDeltas({...base,totals:{...base.totals,total:0,occupied:0}},changed).occupied).toBe(50.5);});
 it("first load stays silent",()=>{expect(tvStateDeltas(null,changed)).toEqual({});});
 it("reconnect stays silent",()=>{expect(tvStateDeltas(base,changed,true)).toEqual({});});
 it("new Berlin day stays silent",()=>{expect(tvStateDeltas(base,{...changed,day:"2026-10-24"})).toEqual({});});
 it("stale and repeated snapshots stay silent",()=>{expect(tvStateDeltas(base,{...changed,at:"2026-10-23T00:02:00Z"})).toEqual({});expect(tvStateDeltas(base,base)).toEqual({});expect(tvStateDeltas(changed,base)).toEqual({});});
});

import { tvLocationLabel as label } from "./tv";
import { test as t2, expect as e2 } from "vitest";
t2("TV location shows address only", () => {
  e2(label("Pension Bünde — Borriesstr. 39")).toBe("Borriesstr. 39");
  e2(label("Pension Bielefeld — Paderbornerstr. 290")).toBe("Paderbornerstr. 290");
  e2(label("Haus Mitte")).toBe("Haus Mitte");
});
