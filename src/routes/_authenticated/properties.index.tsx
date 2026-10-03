import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Building2, Plus, Pencil, Trash2, QrCode } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import i18n from "@/i18n";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({ meta: [{ title: `${i18n.t("nav.properties")} — Pensify` }] }),
  component: PropertiesPage,
});

type PropertyRow = {
  id: string;
  city_id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
  active: boolean;
};

type CityRow = { id: string; name: string };

function useCities() {
  return useQuery({
    queryKey: ["cities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cities").select("id, name").order("name");
      if (error) throw error;
      return data as CityRow[];
    },
  });
}

function useProperties() {
  return useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, city_id, name, address, latitude, longitude, geofence_radius_m, active")
        .order("name");
      if (error) throw error;
      return data as PropertyRow[];
    },
  });
}

function PropertiesPage() {
  const { t } = useTranslation();
  const { data: cities = [] } = useCities();
  const { data: properties = [], isLoading } = useProperties();
  const { data: stats = {} } = useQuery({
    queryKey: ["property-room-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("property_id,status");
      if (error) throw error;
      const s: Record<string, { total: number; free: number; cleaning: number }> = {};
      for (const r of data ?? []) {
        const e = (s[r.property_id] ??= { total: 0, free: 0, cleaning: 0 });
        e.total++;
        if (r.status === "available" || r.status === "cleaned") e.free++;
        if (r.status === "cleaning_required" || r.status === "cleaning_in_progress" || r.status === "checkout_today") e.cleaning++;
      }
      return s;
    },
  });
  const [editing, setEditing] = useState<PropertyRow | null>(null);
  const [open, setOpen] = useState(false);

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(p: PropertyRow) { setEditing(p); setOpen(true); }

  return (
    <AppShell
      title={t("pages.properties.title")}
      subtitle={t("pages.properties.subtitle", { count: properties.length, cities: cities.length })}
      actions={
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="w-4 h-4" /> {t("pensions.addNew")}
        </Button>
      }
    >
      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Building2 className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">{t("pensions.noPensions")}</p>
          <Button onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> {t("pensions.addNew")}</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {cities.map((c) => {
            const list = properties.filter((p) => p.city_id === c.id);
            if (list.length === 0) return null;
            return (
              <div key={c.id}>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-primary" />
                  <h2 className="text-base font-semibold tracking-tight">{c.name}</h2>
                  <span className="text-xs text-muted-foreground">· {list.length}</span>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.map((p) => (
                    <Section
                      key={p.id}
                      title={p.name}
                      action={
                        <div className="flex gap-1">
                          <Link to="/properties/$id/qr" params={{ id: p.id }}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="QR">
                              <QrCode className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <DeleteButton id={p.id} name={p.name} />
                        </div>
                      }
                    >
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {p.address}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {!p.active && <Badge tone="muted">{t("common.inactive")}</Badge>}
                        <Badge tone="info">{stats[p.id]?.total ?? 0} Zimmer</Badge>
                        <Badge tone="success">{stats[p.id]?.free ?? 0} frei</Badge>
                        {(stats[p.id]?.cleaning ?? 0) > 0 && (
                          <Badge tone="warning">{stats[p.id]?.cleaning} Reinigung</Badge>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Link to="/properties/$id/rooms" params={{ id: p.id }}>
                          <Button size="sm" className="w-full gap-1.5">
                            <Building2 className="w-4 h-4" /> Zimmer
                          </Button>
                        </Link>
                        <Link to="/reservations" search={{ property: p.id }}>
                          <Button size="sm" variant="outline" className="w-full">Buchungen</Button>
                        </Link>
                      </div>
                    </Section>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PropertyDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        cities={cities}
      />
    </AppShell>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("pensions.deletedToast"));
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
          <AlertDialogDescription>{name}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PropertyDialog({
  open, onOpenChange, editing, cities,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PropertyRow | null;
  cities: CityRow[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    address: "",
    city_id: "",
    latitude: "",
    longitude: "",
    geofence_radius_m: "300",
  });

  // Reset form when dialog opens
  function handleOpenChange(v: boolean) {
    if (v) {
      setForm({
        name: editing?.name ?? "",
        address: editing?.address ?? "",
        city_id: editing?.city_id ?? cities[0]?.id ?? "",
        latitude: editing?.latitude?.toString() ?? "",
        longitude: editing?.longitude?.toString() ?? "",
        geofence_radius_m: (editing?.geofence_radius_m ?? 300).toString(),
      });
    }
    onOpenChange(v);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        city_id: form.city_id,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        geofence_radius_m: Number(form.geofence_radius_m) || 300,
      };
      if (!payload.name || !payload.address || !payload.city_id) {
        throw new Error("Name, address and city are required");
      }
      if (editing) {
        const { error } = await supabase.from("properties").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("properties").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("pensions.savedToast"));
      qc.invalidateQueries({ queryKey: ["properties"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t("pensions.editPension") : t("pensions.addNew")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="name">{t("common.name")}</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="city">{t("common.city")}</Label>
            <Select value={form.city_id} onValueChange={(v) => setForm({ ...form, city_id: v })}>
              <SelectTrigger><SelectValue placeholder={t("pensions.selectCity")} /></SelectTrigger>
              <SelectContent>
                {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="address">{t("common.address")}</Label>
            <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="lat">{t("common.latitude")}</Label>
              <Input id="lat" type="number" step="0.000001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="lng">{t("common.longitude")}</Label>
              <Input id="lng" type="number" step="0.000001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="geo">{t("common.geofence")}</Label>
            <Input id="geo" type="number" value={form.geofence_radius_m} onChange={(e) => setForm({ ...form, geofence_radius_m: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {editing ? t("common.update") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
