import { describe, expect, it } from "vitest";
import { attendanceDays, localWorkDate } from "./attendance";

describe("individual workdays and separate absences", () => {
  const schedule = [{member_id:"a",effective_from:"2026-10-01",weekdays:[1,2,3,4,5]}];
  it("uses each person's own weekends, not a company-wide default", () => {
    expect(attendanceDays("a","2026-10-24","2026-10-24",schedule,[],new Set())[0].status).toBe("off");
    expect(attendanceDays("b","2026-10-24","2026-10-24",[{member_id:"b",effective_from:"2026-10-01",weekdays:[6]}],[],new Set())[0].status).toBe("missing");
  });
  it("records sick days separately without fabricating work", () => {
    const a = {id:"s",member_id:"a",start_date:"2026-10-26",end_date:"2026-10-26",kind:"sick",note:"",cancelled:false,created_at:""};
    const day = attendanceDays("a","2026-10-26","2026-10-26",schedule,[a],new Set())[0];
    expect(day.status).toBe("sick"); expect(day.worked).toBe(false);
  });
  it("preserves actual attendance when absence also exists", () => {
    const a = {id:"s",member_id:"a",start_date:"2026-10-26",end_date:"2026-10-26",kind:"leave",note:"",cancelled:false,created_at:""};
    expect(attendanceDays("a","2026-10-26","2026-10-26",schedule,[a],new Set(["2026-10-26"]))[0].worked).toBe(true);
  });
  it("does not accuse employees of absence without a schedule", () => {
    expect(attendanceDays("a","2026-10-26","2026-10-26",[],[],new Set())[0].status).toBe("unplanned");
  });
  it("does not change past days when future workdays change", () => {
    expect(attendanceDays("a","2026-10-24","2026-10-24",[...schedule,{member_id:"a",effective_from:"2026-11-01",weekdays:[6]}],[],new Set())[0].status).toBe("off");
  });
  it("excludes cancelled records and other employees", () => {
    const a = {id:"s",member_id:"a",start_date:"2026-10-26",end_date:"2026-10-26",kind:"sick",note:"",cancelled:true,created_at:""};
    expect(attendanceDays("a","2026-10-26","2026-10-26",schedule,[a,{...a,member_id:"b",cancelled:false}],new Set())[0].status).toBe("missing");
  });
  it("uses the organization timezone for overnight clock-ins", () => {
    expect(localWorkDate("2026-10-20T23:30:00Z","Europe/Berlin")).toBe("2026-10-21");
  });
});