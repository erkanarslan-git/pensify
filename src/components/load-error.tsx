import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const TEXT = {
  de: { title: "Daten konnten nicht geladen werden.", hint: "Die Anzeige ist nicht aktuell. Bitte Verbindung prüfen.", retry: "Erneut versuchen" },
  en: { title: "Data could not be loaded.", hint: "This view is not up to date. Please check your connection.", retry: "Try again" },
  tr: { title: "Veriler yüklenemedi.", hint: "Görünüm güncel değil. Lütfen bağlantınızı kontrol edin.", retry: "Tekrar dene" },
} as const;

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language?.slice(0, 2) ?? "de") as keyof typeof TEXT;
  const tx = TEXT[lang] ?? TEXT.de;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <div className="flex-1 min-w-48">
        <div className="font-medium">{tx.title}</div>
        <div className="text-xs text-muted-foreground">{tx.hint}</div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>{tx.retry}</Button>
    </div>
  );
}
