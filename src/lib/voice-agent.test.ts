import { describe, expect, it } from "vitest";
import { inServiceWindow, parseElevenLabsCall, voiceStats } from "./voice-agent";

describe("voice agent", () => {
  it("service window 19:00-08:00 crosses midnight", () => {
    expect(inServiceWindow("18:59", "19:00", "08:00")).toBe(false);
    expect(inServiceWindow("19:00", "19:00", "08:00")).toBe(true);
    expect(inServiceWindow("03:00", "19:00", "08:00")).toBe(true);
    expect(inServiceWindow("08:00", "19:00", "08:00")).toBe(false);
  });
  it("transferred calls are not counted as resolved", () => {
    const s = voiceStats([
      { outcome: "reservation", duration_seconds: 120, successful: true },
      { outcome: "info", duration_seconds: 60, successful: true },
      { outcome: "transferred", duration_seconds: 30, successful: null },
      { outcome: "unresolved", duration_seconds: 30, successful: false },
    ]);
    expect(s).toMatchObject({ total: 4, resolved: 2, reservations: 1, transferred: 1, unresolved: 1, resolutionRate: 50, avgSeconds: 60 });
  });
  it("parses an ElevenLabs post-call payload", () => {
    const r = parseElevenLabsCall({ type: "post_call_transcription", data: { agent_id: "a1", conversation_id: "c1",
      transcript: [{ role: "agent", message: "Guten Abend" }, { role: "user", message: "Zimmer?" }],
      metadata: { start_time_unix_secs: 1_800_000_000, call_duration_secs: 95, phone_call: { external_number: "+491701234" } },
      analysis: { call_successful: "success", transcript_summary: "Zimmer gebucht", data_collection_results: { outcome: { value: "reservation" } } } } });
    expect(r?.agentId).toBe("a1");
    expect(r?.row).toMatchObject({ external_id: "c1", caller_phone: "+491701234", duration_seconds: 95, outcome: "reservation", successful: true });
    expect(r?.row.transcript).toHaveLength(2);
    expect(parseElevenLabsCall({ type: "other" })).toBeNull();
  });
});
