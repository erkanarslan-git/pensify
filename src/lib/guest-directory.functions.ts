import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GuestDirectory } from "./guest-directory";
export const loadGuestDirectory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ search: z.string().max(120), kind: z.enum(["all","individual","company"]), page: z.number().int().min(0), size: z.union([z.literal(10),z.literal(20),z.literal(30),z.literal(40),z.literal(50)]) }))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("guest_directory", { _search: data.search, _kind: data.kind, _page: data.page, _size: data.size });
    if (result.error) throw new Error("guests_unavailable"); return result.data as unknown as GuestDirectory;
  });