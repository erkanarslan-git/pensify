/** Caller must authorize the recipient and organization before sending. No token values are logged. */
export async function sendDevicePush(token: string, body: string, path: string, tag?: string): Promise<"sent" | "stale" | "error"> {
  const key = process.env.LOVABLE_API_KEY;
  const connection = process.env.FIREBASE_MESSAGING_API_KEY;
  if (!key || !connection) throw new Error("push_not_configured");
  const response = await fetch("https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": connection, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, notification: { title: "Pension Highway", body }, data: { path }, webpush: { headers: { TTL: "3600" }, notification: { ...(tag ? { tag } : {}) } } } }),
  });
  if (response.ok) { await response.text(); return "sent"; }
  const text = await response.text();
  if ((response.status === 404 && text.includes("UNREGISTERED")) || (response.status === 400 && text.includes("INVALID_ARGUMENT"))) return "stale";
  // Provider bodies can contain registration tokens; log only the non-sensitive error code.
  console.error("Push provider failed", response.status);
  return "error";
}