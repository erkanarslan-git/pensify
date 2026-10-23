import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GuestEntry } from "@/lib/guest-directory";
export function GuestContactEditor({guest}:{guest:GuestEntry}){
  const {t}=useTranslation();const permissions=usePermissions();const qc=useQueryClient();const [email,setEmail]=useState(guest.email??"");const [phone,setPhone]=useState(guest.phone??"");const [company,setCompany]=useState(guest.company??"");const [vat,setVat]=useState(guest.vat??"");const [address,setAddress]=useState(guest.address??"");const [contact,setContact]=useState(guest.contact??"");const [busy,setBusy]=useState(false);
  if(!permissions.can("create_reservation"))return null;
  // VAT/address/payer live on the booking record; without a booking link they cannot be saved, so don't offer them.
  const hasBooking=guest.identity_key.startsWith("booking:");
  const save=async()=>{const id=guest.reservations[0]?.id;if(!id)return;setBusy(true);const result=await supabase.rpc("update_guest_contact",{_reservation:id,_email:email,_phone:phone,_company:company,_vat:vat,_address:address,_contact:contact});setBusy(false);if(result.error)return toast.error(t("guests.failed"));toast.success(t("payments.saved"));await qc.invalidateQueries({queryKey:["guest-directory"]});};
  return <details><summary className="cursor-pointer text-sm font-semibold">{t("guests.editContact")}</summary><div className="grid gap-2 mt-3"><label className="text-xs">{t("guests.email")}<Input type="email" value={email} maxLength={254} onChange={e=>setEmail(e.target.value)}/></label><label className="text-xs">{t("guests.phone")}<Input value={phone} maxLength={80} onChange={e=>setPhone(e.target.value)}/></label>{guest.customer_type==="company"&&hasBooking&&<><label className="text-xs">{t("guests.company")}<Input value={company} maxLength={250} onChange={e=>setCompany(e.target.value)}/></label><label className="text-xs">{t("guests.vat")}<Input value={vat} maxLength={80} onChange={e=>setVat(e.target.value)}/></label><label className="text-xs">{t("guests.address")}<Input value={address} maxLength={2000} onChange={e=>setAddress(e.target.value)}/></label><label className="text-xs">{t("guests.payer")}<Input value={contact} maxLength={250} onChange={e=>setContact(e.target.value)}/></label></>}<Button disabled={busy} onClick={save}>{t("payments.save")}</Button></div></details>;
}