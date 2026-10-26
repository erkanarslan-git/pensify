import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SearchSelect } from '@/components/search-select';
import { PersonnelAttendance } from '@/components/personnel-attendance';
import { PersonnelOvertime } from '@/components/personnel-overtime';
import { supabase } from '@/integrations/supabase/client';
import { businessDate } from '@/lib/business-time';
export const Route=createFileRoute('/_authenticated/time-tracking')({head:()=>({meta:[{title:'Zaman Takibi — Pension Highway'},{name:'description',content:'Kişi ve dönem bazlı çalışma, izin ve fazla mesai takibi.'},{property:'og:title',content:'Zaman Takibi — Pension Highway'},{property:'og:description',content:'Sade personel çalışma ve devam kayıtları.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:TimeTrackingPage});
function monthRange(month:string){const [y,m]=month.split('-').map(Number);return [`${month}-01`,new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)];}
function TimeTrackingPage(){
 const {t}=useTranslation();const [person,setPerson]=useState('');const [month,setMonth]=useState(businessDate().slice(0,7));const [custom,setCustom]=useState(false);const [range,setRange]=useState(monthRange(month));const [mode,setMode]=useState('normal');const [from,to]=custom?range:monthRange(month);
 const q=useQuery({queryKey:['attendance-personnel'],queryFn:async()=>{const {data,error}=await supabase.rpc('attendance_personnel');if(error)throw error;return data as unknown as {org:string;members:{id:string;user_id:string;name:string}[]};}});
 const selected=q.data?.members.find(m=>m.user_id===person);
 const shift=(n:number)=>{const [y,m]=month.split('-').map(Number);setMonth(new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7));setCustom(false);};
 return <AppShell title={t('nav.timeTracking')}><div className="space-y-5"><div className="flex flex-wrap items-end gap-3 print:hidden"><div className="w-full sm:w-80"><Label className="mb-1.5 block">{t('departments.personnel')}</Label><SearchSelect value={person} options={q.data?.members.map(m=>({id:m.user_id,name:m.name}))??[]} onChange={id=>{setPerson(id);}} placeholder={t('records.choose')} searchLabel={t('records.searchStaff')} disabled={q.isPending}/></div><div><Label className="mb-1.5 block">{t('records.period')}</Label><div className="flex gap-1"><Button size="icon" variant="outline" aria-label={t('records.previous')} onClick={()=>shift(-1)}><ChevronLeft className="size-4"/></Button><Input type="month" aria-label={t('records.period')} className="w-44" value={month} onChange={e=>{if(e.target.value){setMonth(e.target.value);setCustom(false);}}}/><Button size="icon" variant="outline" aria-label={t('records.next')} onClick={()=>shift(1)}><ChevronRight className="size-4"/></Button></div></div><Button variant="ghost" onClick={()=>{setRange(monthRange(month));setCustom(v=>!v);}}>{t('records.custom')}</Button>{custom&&<><Label className="grid gap-1">{t('timeTracking.from')}<Input type="date" value={from} onChange={e=>setRange([e.target.value,to])}/></Label><Label className="grid gap-1">{t('timeTracking.to')}<Input type="date" value={to} min={from} onChange={e=>setRange([from,e.target.value])}/></Label></>}</div>
 {q.isError?<div role="alert"><p>{t('attendance.loadFailed')}</p><Button variant="outline" onClick={()=>q.refetch()}>{t('records.retry')}</Button></div>:!selected?<p className="py-12 text-sm text-muted-foreground">{t('records.selectFirst')}</p>:from&&to&&to>=from&&Date.parse(to)-Date.parse(from)<=366*86400000?<Tabs value={mode} onValueChange={setMode}><TabsList className="print:hidden"><TabsTrigger value="normal">{t('records.normal')}</TabsTrigger><TabsTrigger value="overtime">{t('overtime.title')}</TabsTrigger></TabsList><TabsContent value="normal"><PersonnelAttendance key={`${q.data?.org}-${person}`} org={q.data?.org??''} userId={person} name={selected.name} from={from} to={to}/></TabsContent><TabsContent value="overtime"><PersonnelOvertime org={q.data?.org??''} userId={person} name={selected.name} from={from} to={to}/></TabsContent></Tabs>:<p role="alert">{t('newRes.errDates')}</p>}</div></AppShell>;
}
