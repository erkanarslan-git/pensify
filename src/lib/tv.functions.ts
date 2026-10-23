import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { tvTokenSchema, tvSnapshotSchema } from "./tv";
import type { Database } from "@/integrations/supabase/types";

export const getTvSnapshot = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => ({ token: tvTokenSchema.parse(input.token) }))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    setResponseHeader("Referrer-Policy", "no-referrer");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("display_unavailable");
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data: snapshot, error } = await client.rpc("tv_snapshot_v3", { _token: data.token });
    if (error) throw new Error("display_unavailable");
    return snapshot === null ? null : tvSnapshotSchema.parse(snapshot);
  });