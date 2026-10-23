import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SearchSelect } from '@/components/search-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CustomerParty, CustomerKind } from '@/lib/customer-history';

export function CustomerEditor({open,onClose,kind,party,initialName='',onSaved}:{open:boolean;onClose:()=>void;kind:CustomerKind;party?:CustomerParty;initialName?:string;onSaved?:(party:CustomerParty)=>void}){
 const {t}=useTranslation();const qc=useQueryClient();const [form,setForm]=useState({name:party?.name??initialName,email:party?.email??'',phone:party?.phone??'',vat:party?.vat??'',address:party?.address??'',contact:party?.contact??''});const [busy,setBusy]=useState(false);
 const save=async()=>{if(busy||!form.name.trim())return;setBusy(true);try{const {data,error}=await supabase.rpc('save_customer',{_data:{...form,kind},...(party?{_id:party.id}:{})});if(error)throw error;await qc.invalidateQueries({queryKey:['customer-parties']});await qc.invalidateQueries({queryKey:['customer-history']});onSaved?.({id:String(data),kind,...form});toast.success(t('payments.saved'));onClose();}catch{toast.error(t('guests.failed'));}finally{setBusy(false);}};
 return <Dialog open={open} onOpenChange={v=>{if(!v)onClose();}}><DialogContent><DialogHeader><DialogTitle>{t(party?'records.edit':'records.addCustomer')}</DialogTitle></DialogHeader><div className="grid gap-3">{(['name','email','phone','address',...(kind==='company'?['vat','contact']:[])] as (keyof typeof form)[]).map(k=><Label key={k} className="grid gap-1">{t(k==='name'?'records.name':k==='contact'?'guests.payer':`guests.${k}`)}<Input value={form[k]} maxLength={k==='address'?2000:k==='phone'||k==='vat'?80:250} type={k==='email'?'email':'text'} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></Label>)}<Button disabled={busy||!form.name.trim()} onClick={save}>{t('common.save')}</Button></div></DialogContent></Dialog>;
}
export function CustomerPicker({kind,value,onChange,label,initialName}:{kind:CustomerKind;value:string;onChange:(party:CustomerParty)=>void;label:string;initialName?:string}) {
 const {t}=useTranslation();const [add,setAdd]=useState(false);
 const org=useQuery({queryKey:['active-organization'],queryFn:async()=>{const {data,error}=await supabase.rpc('active_organization_id');if(error||!data)throw Error('organization_required');return data;}});
 const q=useQuery({queryKey:['customer-parties',org.data,kind],enabled:!!org.data,queryFn:async()=>{if(!org.data)return [];const {data,error}=await supabase.from('customer_parties').select('id,kind,name,email,phone,vat,address,contact').eq('organization_id',org.data).eq('kind',kind).order('name');if(error)throw error;return data as CustomerParty[];}});
 return <div className="space-y-1.5"><Label>{label}</Label><div className="flex gap-2"><SearchSelect value={value} options={q.data??[]} placeholder={label} searchLabel={t('records.searchCustomer')} onChange={id=>{const p=q.data?.find(p=>p.id===id);if(p)onChange(p);}}/><Button size="icon" variant="outline" title={t('records.addCustomer')} aria-label={t('records.addCustomer')} onClick={()=>setAdd(true)}><Plus className="size-4"/></Button></div>{q.isError&&<p role="alert" className="text-xs text-destructive">{t('guests.failed')}</p>}{add&&<CustomerEditor open={add} onClose={()=>setAdd(false)} kind={kind} initialName={initialName} onSaved={onChange}/>}</div>;
}