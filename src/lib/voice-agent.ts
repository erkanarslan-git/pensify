export const VOICE_OUTCOMES = ["info", "reservation", "access_code", "transferred", "unresolved", "failed"] as const;
export type VoiceOutcome = (typeof VOICE_OUTCOMES)[number];

export type VoiceCallRow = {
  outcome: VoiceOutcome;
  duration_seconds: number;
  successful: boolean | null;
};

/** Resolved = handled by the agent without a human (info, booking, access code). */
export function voiceStats(calls: VoiceCallRow[]) {
  const total = calls.length;
  const count = (o: VoiceOutcome) => calls.filter((c) => c.outcome === o).length;
  const resolved = count("info") + count("reservation") + count("access_code");
  const seconds = calls.reduce((s, c) => s + Math.max(0, c.duration_seconds || 0), 0);
  return {
    total,
    resolved,
    reservations: count("reservation"),
    transferred: count("transferred"),
    unresolved: count("unresolved") + count("failed"),
    resolutionRate: total ? Math.round((resolved / total) * 100) : 0,
    avgSeconds: total ? Math.round(seconds / total) : 0,
  };
}

/** Is the Berlin wall-clock time "HH:MM" inside the service window (window may cross midnight)? */
export function inServiceWindow(now: string, from: string, to: string): boolean {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const n = m(now), f = m(from), t = m(to);
  if (f === t) return true;
  return f < t ? n >= f && n < t : n >= f || n < t;
}

type Turn = { role?: string; message?: string | null; time_in_call_secs?: number };

export function parseElevenLabsCall(payload: unknown) {
  const p = payload as { type?: string; data?: Record<string, any> };
  if (p?.type !== "post_call_transcription" || !p.data) return null;
  const d = p.data;
  const agentId = typeof d.agent_id === "string" ? d.agent_id : null;
  const externalId = typeof d.conversation_id === "string" ? d.conversation_id : null;
  if (!agentId || !externalId) return null;
  const meta = d.metadata ?? {};
  const analysis = d.analysis ?? {};
  const collected = analysis.data_collection_results ?? {};
  const rawOutcome = String(collected.outcome?.value ?? "").toLowerCase();
  const success = analysis.call_successful;
  const outcome: VoiceOutcome = (VOICE_OUTCOMES as readonly string[]).includes(rawOutcome)
    ? (rawOutcome as VoiceOutcome)
    : success === "failure" ? "unresolved" : "info";
  const transcript = (Array.isArray(d.transcript) ? (d.transcript as Turn[]) : [])
    .filter((t) => t.message)
    .map((t) => ({ role: t.role === "agent" ? "agent" : "user", text: String(t.message).slice(0, 4000), at: t.time_in_call_secs ?? null }));
  const caller = meta.phone_call?.external_number ?? d.conversation_initiation_client_data?.dynamic_variables?.system__caller_id ?? null;
  const start = Number(meta.start_time_unix_secs);
  return {
    agentId,
    row: {
      external_id: externalId.slice(0, 200),
      caller_phone: caller ? String(caller).slice(0, 40) : null,
      started_at: Number.isFinite(start) && start > 0 ? new Date(start * 1000).toISOString() : new Date().toISOString(),
      duration_seconds: Math.max(0, Math.round(Number(meta.call_duration_secs) || 0)),
      language: typeof d.metadata?.main_language === "string" ? d.metadata.main_language.slice(0, 10) : (collected.language?.value ? String(collected.language.value).slice(0, 10) : null),
      outcome,
      successful: success === "success" ? true : success === "failure" ? false : null,
      summary: analysis.transcript_summary ? String(analysis.transcript_summary).slice(0, 4000) : null,
      transcript,
      transferred_to: collected.transferred_to?.value ? String(collected.transferred_to.value).slice(0, 60) : null,
    },
  };
}
