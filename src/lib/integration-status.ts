export type ConnectionState = "not_configured" | "preparation" | "connected" | "error" | "reauth_required";
export function bankConnectionState(adapterAvailable: boolean, status?: string): ConnectionState {
  if (!adapterAvailable) return "not_configured";
  if (status === "error" || status === "reauth_required" || status === "connected") return status;
  return status === "connecting" ? "preparation" : "not_configured";
}
export function channelConnectionState(configured: boolean, mapped: boolean, verified: boolean, error: boolean): ConnectionState {
  if (error) return "error";
  if (!configured) return "not_configured";
  return mapped && verified ? "connected" : "preparation";
}