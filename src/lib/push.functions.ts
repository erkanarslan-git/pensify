import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

/** Send a push notification to every registered device of a user. Stale tokens are deleted. */
async function sendPushToUser(userId: string, title: string, body: string, path: string): Promise<{ sent: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin.from("push_tokens").select("id,token").eq("user_id", userId);
  if (!rows?.length) return { sent: 0 };
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connectionKey = process.env.FIREBASE_MESSAGING_API_KEY;
  if (!lovableKey || !connectionKey) throw new Error("push_not_configured");
  const headers = {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
  let sent = 0;
  for (const row of rows) {
    const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: {
          token: row.token,
          notification: { title, body },
          data: { path },
        },
      }),
    });
    if (res.ok) {
      sent++;
      continue;
    }
    const text = await res.text();
    // Stale registration token: remove it instead of retrying.
    if (res.status === 404 || (res.status === 400 && text.includes("INVALID_ARGUMENT"))) {
      await supabaseAdmin.from("push_tokens").delete().eq("id", row.id);
    } else {
      console.error(`FCM send failed [${res.status}]: ${text}`);
    }
  }
  return { sent };
}

export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string; userAgent?: string }) => {
    if (!input || typeof input.token !== "string" || input.token.length < 10 || input.token.length > 4096) {
      throw new Error("invalid_token");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { resolveActiveOrg } = await import("./org-auth.server");
    const { orgId } = await resolveActiveOrg(context.supabase);
    const { error } = await context.supabase.from("push_tokens").upsert(
      {
        organization_id: orgId,
        user_id: context.userId,
        token: data.token,
        user_agent: (data.userAgent ?? "").slice(0, 300),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) throw new Error("push_register_failed");
    return { ok: true };
  });

export const unregisterPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    if (!input || typeof input.token !== "string") throw new Error("invalid_token");
    return input;
  })
  .handler(async ({ data, context }) => {
    // RLS scopes this to the caller's own tokens.
    await context.supabase.from("push_tokens").delete().eq("token", data.token);
    return { ok: true };
  });

/** Notify the assignee after a todo is saved. The caller must be able to read the todo (RLS). */
export const notifyTodoAssigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { todoId: string }) => {
    if (!input || typeof input.todoId !== "string") throw new Error("invalid_todo");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: todo } = await context.supabase
      .from("todos")
      .select("id,title,assigned_to")
      .eq("id", data.todoId)
      .maybeSingle();
    if (!todo?.assigned_to || todo.assigned_to === context.userId) return { sent: 0 };
    return sendPushToUser(todo.assigned_to, "Pension Highway", todo.title, "/todos");
  });
