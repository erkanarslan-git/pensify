import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { businessDate } from '@/lib/business-time';
import { hoursMinutes } from '@/lib/personnel-ledger';
type OvertimeRow={id:string;clock_in_at:string;clock_out_at:string;break_minutes:number;property:string;minutes:number;approved_at:string|null;approved_by:string;reason:string|null;can_approve:boolean};
export function PersonnelOvertime({org,userId,name,from,to}:{org:string;userId:string;name:string;from:string;to:string}) {
 const {t}=useTranslation();const qc=useQueryClient();const [entry,setEntry]=useState<OvertimeRow|null>(null);const [minutes,setMinutes]=useState('');const [reason,setReason]=useState('');
 const q=useQuery({queryKey:['personnel-overtime',org,userId,from,to],queryFn:async()=>{const {data,error}=await supabase.rpc('personnel_overtime',{_from:from,_to:to,_user_id:userId});if(error)throw error;return data as unknown as OvertimeRow[];}});
 const net=(e:OvertimeRow)=>Math.max(0,Math.round((Date.parse(e.clock_out_at)-Date.parse(e.clock_in_at))/60000)-e.break_minutes);
 const save=useMutation({mutationFn:async()=>{if(!entry)throw Error('no_entry');const {error}=await supabase.rpc('approve_time_entry_overtime',{_entry_id:entry.id,_minutes:Number(minutes),_reason:reason.trim()});if(error)throw error;},onSuccess:async()=>{await qc.invalidateQueries({queryKey:['personnel-overtime']});setEntry(null);toast.success(t('overtime.saved'));},onError:(e:Error)=>toast.error(t(e.message.includes('overtime_rate_required')?'overtime.rateRequired':'overtime.failed'))});
 if(q.isPending)return <p>{t('common.loading')}</p>;
 if(q.isError)return <div role="alert"><p>{t('overtime.loadingFailed')}</p><Button variant="outline" onClick={()=>q.refetch()}>{t('records.retry')}</Button></div>;
 return <div className="space-y-3"><h2 className="font-semibold">{name} · {from} — {to}</h2>{!q.data.length?<p className="py-8 text-muted-foreground">{t('records.empty')}</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b border-border">{['attendance.date','records.location','records.confirmed','overtime.overtime','overtime.approval'].map(k=><th className="p-2 font-medium" key={k}>{t(k)}</th>)}</tr></thead><tbody>{q.data.map(e=><tr key={e.id} className="border-b border-border"><td className="p-2 whitespace-nowrap">{businessDate(new Date(e.clock_in_at)).split('-').reverse().join('.')}</td><td className="p-2">{e.property}</td><td className="p-2 tabular-nums">{hoursMinutes(net(e))}</td><td className="p-2 tabular-nums">{hoursMinutes(e.minutes)}</td><td className="p-2">{e.approved_at&&<p className="text-xs">{e.approved_by} · {e.reason}</p>}{e.can_approve&&<Button variant="outline" size="sm" onClick={()=>{setEntry(e);setMinutes(String(e.minutes));setReason('');}}>{t('overtime.approve')}</Button>}</td></tr>)}</tbody></table></div>}<Dialog open={!!entry} onOpenChange={v=>{if(!v)setEntry(null);}}><DialogContent><DialogHeader><DialogTitle>{t('records.approval')}</DialogTitle></DialogHeader><Label>{t('overtime.minutes')}<Input type="number" min={0} max={entry?net(entry):0} value={minutes} onChange={e=>setMinutes(e.target.value)}/></Label><Label>{t('overtime.reason')}<Input value={reason} onChange={e=>setReason(e.target.value)}/></Label><Button onClick={()=>save.mutate()} disabled={save.isPending||reason.trim().length<3||minutes===''||!Number.isInteger(Number(minutes))||Number(minutes)<0||Number(minutes)>(entry?net(entry):0)}>{t('overtime.approve')}</Button></DialogContent></Dialog></div>;
}