import type { TFunction } from "i18next";

/** Maps database "has children" delete refusals to a plain-language message, or null. */
export function deleteGuardMessage(t: TFunction, err: { message?: string } | null | undefined): string | null {
  const m = /HAS_CHILDREN:(\w+)/.exec(err?.message ?? "");
  return m ? t(`deleteGuard.${m[1]}`) : null;
}
