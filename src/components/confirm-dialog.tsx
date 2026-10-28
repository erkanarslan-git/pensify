import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";

type Options = { title?: string; description?: string; confirmLabel?: string; destructive?: boolean; input?: { label?: string; defaultValue?: string } };
type Request = Options & { resolve: (v: string | null) => void };
let push: ((r: Request) => void) | null = null;

/** In-app replacement for window.prompt: resolves the entered text, or null when cancelled. */
export function promptAction(opts: Options): Promise<string | null> {
  return new Promise((resolve) => { if (!push) return resolve(null); push({ ...opts, input: opts.input ?? {}, resolve }); });
}
/** In-app replacement for window.confirm. */
export async function confirmAction(opts: Options): Promise<boolean> {
  return new Promise((resolve) => { if (!push) return resolve(false); push({ ...opts, input: undefined, resolve: (v) => resolve(v !== null) }); });
}

export function ConfirmDialogHost() {
  const { t } = useTranslation();
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  useEffect(() => { push = (r) => { setValue(r.input?.defaultValue ?? ""); setReq(r); }; return () => { push = null; }; }, []);
  const close = (v: string | null) => { req?.resolve(v); setReq(null); };
  return (
    <AlertDialog open={!!req} onOpenChange={(o) => { if (!o) close(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title ?? t("confirmDialog.title")}</AlertDialogTitle>
          {req?.description && <AlertDialogDescription className="whitespace-pre-line">{req.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {req?.input && <Input autoFocus aria-label={req.input.label ?? t("confirmDialog.reason")} placeholder={req.input.label ?? t("confirmDialog.reason")} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") close(value); }} />}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("confirmDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction className={req?.destructive ? buttonVariants({ variant: "destructive" }) : undefined} onClick={() => close(req?.input ? value : "")}>
            {req?.confirmLabel ?? t("confirmDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
