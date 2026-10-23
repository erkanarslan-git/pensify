import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Maximize, Volume2, VolumeX, Wifi, WifiOff, CalendarPlus, BedDouble, DoorOpen, LogIn, LogOut, Brush, Wrench, Coins, ChevronLeft, ChevronRight, Pause, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTvSnapshot } from "@/lib/tv.functions";
import { tvAccumulate, type TvDailyDeltas, tvUpdate, nextTvPage, tvLocationLayout, TV_DELTA_MS, TV_CELEBRATION_MS, tvTokenSchema, type TvSnapshot } from "@/lib/tv";
import { BUSINESS_TIME_ZONE, businessDate, businessTime } from "@/lib/business-time";
import { normalizeChannel } from "@/lib/guest-color";

export const Route = createFileRoute("/tv")({
 head: () => ({ meta: [{ title: "Pensify — TV-Betriebsübersicht" }, { name: "description", content: "Live-Betriebsübersicht mit Reservierungen, Zimmerstatus und Standorten ohne personenbezogene Daten." }, { property: "og:title", content: "Pensify — TV-Betriebsübersicht" }, { property: "og:description", content: "Anonyme Tagesübersicht für den Hotelbetrieb." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" }] }), component: TvPage,
});
const sourceLabels: Record<string,string> = {booking:"Booking.com",airbnb:"Airbnb",expedia:"Expedia",check24:"Check24",website:"Website",direct:"Direkt",operation:"Betrieb",ical:"iCal"};
function sourceName(source:string) { return sourceLabels[source] ?? sourceLabels[normalizeChannel(source)]; }
function TvPage() {
 const { i18n } = useTranslation();
 const t = i18n.getFixedT("de");
 const [token,setToken] = useState<string|null>(null);
 const [loaded,setLoaded] = useState(false);
 const [online,setOnline] = useState(true);
 const [now,setNow] = useState(Date.now());
 const [sound,setSound] = useState(false);
 const [activated,setActivated] = useState(false);
 const [volume,setVolume] = useState(35);
 const [locationPage,setLocationPage] = useState(0);
 const [pageSize,setPageSize] = useState(1);
 const [eventSize,setEventSize] = useState(3);
 const [paused,setPaused] = useState(false);
 const [interacting,setInteracting] = useState(false);
 const [progress,setProgress] = useState(0);
 const [deltas,setDeltas] = useState<Record<string,number>>({});
 const [highlight,setHighlight] = useState<string[]>([]);
 const [celebration,setCelebration] = useState<TvSnapshot["events"]>([]);
 const previous = useRef<TvSnapshot|null>(null);
 const reconnecting = useRef(false);
 const audio = useRef<AudioContext|null>(null);
 const soundPrefs = useRef({sound:false,volume:35});
 const deltaTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
 const celebrationTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
 const highlightTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
 const locationSection = useRef<HTMLElement|null>(null);
 const eventList = useRef<HTMLDivElement|null>(null);
 const read = useServerFn(getTvSnapshot);
 soundPrefs.current = {sound,volume};
 useEffect(()=>{
  const parsed=tvTokenSchema.safeParse(window.location.hash.slice(1)); setToken(parsed.success?parsed.data:null); setLoaded(true); setOnline(navigator.onLine);
  try { const saved=Number(localStorage.getItem("pensify.tv.volume")); if(localStorage.getItem("pensify.tv.volume") && Number.isFinite(saved)) setVolume(Math.max(0,Math.min(100,saved))); } catch { /* Optional preferences. */ }
  const lost=()=>{setOnline(false);reconnecting.current=true;}; const restored=()=>setOnline(true);
  window.addEventListener("offline",lost);window.addEventListener("online",restored);
  const timer=setInterval(()=>setNow(Date.now()),1000);
  return ()=>{window.removeEventListener("offline",lost);window.removeEventListener("online",restored);clearInterval(timer); if(deltaTimer.current)clearTimeout(deltaTimer.current);if(celebrationTimer.current)clearTimeout(celebrationTimer.current);if(highlightTimer.current)clearTimeout(highlightTimer.current);void audio.current?.close();};
 },[]);
 const query=useQuery({queryKey:["tv-snapshot-v3",token],enabled:!!token,queryFn:async()=>{
  const snapshot=await read({data:{token:token??""}});
  // A delayed response cannot roll back a newer validated display.
  return snapshot && previous.current && Date.parse(snapshot.at)<Date.parse(previous.current.at)?previous.current:snapshot;
 },refetchInterval:10000,refetchIntervalInBackground:true,retry:1,staleTime:0});
 const data=query.data;
 const {pages,slots}=tvLocationLayout(data?.properties.length??0,pageSize);
 const currentPage=Math.min(locationPage,pages-1);
 useEffect(()=>{if(query.isError)reconnecting.current=true;},[query.isError]);
 useEffect(()=>{
  if(data && (now-Date.parse(data.at)>90000)) reconnecting.current=true;
  if(data && data.day!==businessDate(new Date(now)) && online) void query.refetch();
 },[now,data?.day,online]);
 useEffect(()=>{
  const section=locationSection.current;const events=eventList.current;if(!section||!events)return;
  const resize=()=>{
   const heading=section.querySelector(".tv-band-heading");const head=section.querySelector("thead");const foot=section.querySelector("tfoot");if(!heading||!head||!foot)return;
   const style=getComputedStyle(section);const base=parseFloat(style.getPropertyValue("--tv-row-height"))||44;
   // Capacity uses all names, not just the shorter names on the current page.
   const nameWidth=section.querySelector(".tv-location-name")?.getBoundingClientRect().width??150;
   const canvas=document.createElement("canvas");const ctx=canvas.getContext("2d");const nameStyle=section.querySelector(".tv-location-name");
   let rowHeight=base;if(ctx&&nameStyle){const cs=getComputedStyle(nameStyle);ctx.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;const longest=Math.max(0,...(data?.properties??[]).map(p=>ctx.measureText(p.name).width));const lines=Math.max(1,Math.ceil(longest/Math.max(1,nameWidth)));rowHeight=Math.max(base,lines*parseFloat(cs.fontSize)*1.2+8);}
   const available=section.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-heading.getBoundingClientRect().height-head.getBoundingClientRect().height-foot.getBoundingClientRect().height-12;
   // Narrow layouts stack the occupancy bar below the name and need extra room.
   const stacked=window.matchMedia("(max-width: 699px)").matches;
   setPageSize(Math.max(1,Math.floor(available/(rowHeight+(stacked?14:0)))));
   const eventHeight=parseFloat(getComputedStyle(events).getPropertyValue("--tv-event-height"))||42;setEventSize(Math.max(1,Math.floor(events.clientHeight/eventHeight)));
  };
  const observer=new ResizeObserver(resize);observer.observe(section);observer.observe(events);resize();void document.fonts.ready.then(resize);return()=>observer.disconnect();
 },[data?.properties.length,loaded]);
 useEffect(()=>{
  if(!data)return;const update=tvUpdate(previous.current,data,reconnecting.current);previous.current=data;reconnecting.current=false;
  let stored:TvDailyDeltas|null=null;try{stored=JSON.parse(localStorage.getItem("pensify.tv.daily")??"null");}catch{stored=null;}
  const daily=tvAccumulate(stored,data.day,update.deltas);try{localStorage.setItem("pensify.tv.daily",JSON.stringify(daily));}catch{/* Optional. */}
  setDeltas(daily.values);setHighlight(update.events.map(e=>e.id));
  if(highlightTimer.current)clearTimeout(highlightTimer.current);highlightTimer.current=setTimeout(()=>setHighlight([]),1500);
  if(!update.celebrations.length)return;
  setCelebration(update.celebrations);if(celebrationTimer.current)clearTimeout(celebrationTimer.current);celebrationTimer.current=setTimeout(()=>setCelebration([]),TV_CELEBRATION_MS);
  const prefs=soundPrefs.current;if(!prefs.sound||audio.current?.state!=="running")return;
  const context=audio.current;
  const vol=prefs.volume/100;const master=context.createGain();master.gain.value=.5*vol;master.connect(context.destination);
  // Bright bell chime: inharmonic partials with long decay, then a sparkle arpeggio.
  const bell=(f:number,at:number,len:number,level:number)=>{[[1,1],[2.76,.45],[5.4,.22],[8.93,.1]].forEach(([m,l])=>{const o=context.createOscillator();const g=context.createGain();o.type="sine";o.frequency.value=f*m;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(level*l,at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+len/m**.4);o.connect(g);g.connect(master);o.start(at);o.stop(at+len+.05);});};
  const t0=context.currentTime+.02;[[1046.5,0],[1318.5,.12],[1568,.24],[2093,.36]].forEach(([f,d])=>bell(f,t0+d,1.6,.22));
  [2637,3136,3520,4186].forEach((f,i)=>bell(f,t0+.55+i*.06,.6,.08));
 },[query.dataUpdatedAt,data]);
 useEffect(()=>{
  setProgress(0);if(pages<=1||paused||interacting)return;
  const start=Date.now();const interval=(data?.rotationSeconds??10)*1000;
  const timer=setInterval(()=>{const elapsed=Date.now()-start;if(elapsed>=interval){setLocationPage(p=>nextTvPage(p,pages));setProgress(0);}else setProgress(elapsed/interval*100);},100);
  return()=>clearInterval(timer);
 },[pages,currentPage,paused,interacting,data?.rotationSeconds]);
 async function toggleSound(){if(sound){setSound(false);return;}try{audio.current??=new AudioContext();await audio.current.resume();setSound(true);setActivated(true);}catch{setSound(false);}}
 function changeVolume(value:number){setVolume(value);try{localStorage.setItem("pensify.tv.volume",String(value));}catch{/* Optional. */}}
 if(!loaded||(token&&query.isPending))return <main lang="de" className="tv-empty grid min-h-screen place-items-center"><div role="status" className="tv-loading"><CalendarPlus/><strong>Pensify</strong><span>{t("tv.loading")}</span></div></main>;
 if(!token||data===null||(!data&&query.isError))return <main lang="de" className="tv-empty flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center"><h1 className="text-3xl font-bold">Pensify</h1><p>{t(query.isError?"tv.unavailable":"tv.invalid")}</p>{query.isError&&<Button onClick={()=>query.refetch()}>{t("tv.retry")}</Button>}</main>;
 if(!data)return null;
 const disconnected=!online||query.isError||now-Date.parse(data.at)>90000;
 const time=(value:string)=>businessTime(new Date(value));
 const occupancy=data.totals.total?data.totals.occupied/data.totals.total*100:0;
 const cards=[
  {key:"created",value:data.metrics.created,icon:CalendarPlus,tone:"created",detail:t("tv.automaticManual",{automatic:data.metrics.automatic,manual:data.metrics.manual})+(data.metrics.unknownOrigin?` · ${t("tv.unknownOrigin",{count:data.metrics.unknownOrigin})}`:"")},
  {key:"cleaned",value:data.metrics.cleaned,icon:Brush,tone:"cleaning",detail:t("tv.review",{count:data.metrics.review})},
  {key:"maintenanceDone",value:data.metrics.maintenanceDone,icon:Wrench,tone:"maintenance",detail:t("tv.maintenanceDetail",{count:data.metrics.maintenanceOpen})},
  {key:"occupied",value:`${new Intl.NumberFormat("de-DE",{maximumFractionDigits:1}).format(occupancy)}%`,icon:BedDouble,tone:"occupied",detail:t("tv.occupancyDetail",{occupied:data.totals.occupied,total:data.totals.total})},
  {key:"arrivals",value:data.totals.arrivals,icon:LogIn,tone:"arrivals",detail:t("tv.arrivalDetail",{arrived:data.metrics.arrived,expected:data.metrics.arrivalExpected})},
  {key:"departures",value:data.totals.departures,icon:LogOut,tone:"departures",detail:t("tv.departureDetail",{departed:data.metrics.departed,expected:data.metrics.departureExpected})},
  {key:"dueToday",value:data.dues.dueToday,icon:Coins,tone:"dues",detail:t("tv.paymentDetail",data.dues)},
  {key:"ready",value:data.totals.ready,icon:DoorOpen,tone:"ready",detail:t("tv.readyDetail")},
 ];
 const properties=data.properties.slice(currentPage*slots,(currentPage+1)*slots);
 const max=Math.max(1,...data.weekly.flatMap(d=>[d.arrivals,d.departures]));
 const priorities=[{key:"arrivalNotReady",tone:"arrival"},{key:"cleaningPriority",tone:"cleaning"},{key:"dueOpen",tone:"payment"},{key:"maintenanceBlocking",tone:"maintenance"}] as const;
 const celebrationFirst=celebration[0];const multipleLocations=new Set(celebration.map(e=>e.location)).size>1;
 return <main lang="de" className="tv-screen">
  <header className="tv-header"><div className="tv-header-brand"><h1>Pensify</h1><span className="tv-header-label">{t("tv.overview")}</span></div><div className="tv-header-tools"><time className="tv-header-date">{new Intl.DateTimeFormat("de-DE",{timeZone:BUSINESS_TIME_ZONE,day:"numeric",month:"long",year:"numeric"}).format(new Date(now))} · {time(new Date(now).toISOString())}</time><span role="status" className="tv-connection" data-offline={disconnected}>{disconnected?<WifiOff size={16}/>:<Wifi size={16}/>}<span>{t(disconnected?"tv.disconnected":"tv.live")}</span></span><Button size="icon" variant="ghost" title={t("tv.fullscreen")} aria-label={t("tv.fullscreen")} onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>{});}}><Maximize size={18}/></Button></div></header>
  <div className="tv-top"><section className="tv-summary">{cards.map(({key,value,icon:Icon,tone,detail})=><article key={key} data-metric={key} className={`tv-summary-card tv-tone-${tone}`}><svg className="tv-card-waves" viewBox="0 0 300 230" preserveAspectRatio="none" aria-hidden="true"><path d="M80 260C100 130 210 70 350 55" fill="none" stroke="currentColor" strokeWidth="24"/><path d="M120 260C145 150 235 115 350 98" fill="none" stroke="currentColor" strokeWidth="22"/><path d="M162 260C185 185 258 158 350 145" fill="none" stroke="currentColor" strokeWidth="20"/></svg><Icon className="tv-card-icon"/><div className="tv-card-content"><p className="tv-card-label">{t(`tv.${key}`)}</p><div className="tv-number-line"><span className="tv-number">{value}</span>{!!deltas[key]&&<span className="tv-delta" data-negative={deltas[key]<0}>{deltas[key]>0?`+${deltas[key]}`:`−${Math.abs(deltas[key])}`}</span>}</div><p className="tv-card-detail">{detail}</p></div></article>)}</section>
   <aside className="tv-celebration-area" aria-live="polite">{celebrationFirst?<><div className="tv-confetti tv-confetti-full" key={celebrationFirst.id} aria-hidden="true">{Array.from({length:140},(_,i)=><i key={i} data-shape={i%3} style={{"--confetti-x":`${(i*37)%100}%`,"--confetti-delay":`${(i%35)*.06}s`,"--confetti-drift":`${((i*53)%120)-60}px`,"--confetti-spin":`${360+(i*97)%720}deg`,"--confetti-time":`${2.8+(i%7)*.35}s`,"--confetti-color":`var(${["--tv-chart-in","--tv-chart-out","--tv-success","--tv-warn","--primary"][i%5]})`} as CSSProperties}/>)}{Array.from({length:14},(_,i)=><b key={`b${i}`} style={{"--balloon-x":`${(i*29+5)%95}%`,"--balloon-delay":`${(i%7)*.25}s`,"--balloon-time":`${4+(i%4)*.5}s`,"--confetti-color":`var(${["--tv-chart-in","--tv-chart-out","--tv-success","--tv-warn","--primary"][i%5]})`} as CSSProperties}/>)}</div><div className="tv-celebration" style={{"--tv-source":data.colors[normalizeChannel(celebrationFirst.source)]} as CSSProperties}><Sparkles/><strong>{t(celebration.length>1?"tv.newReservations":"tv.newReservation",{count:celebration.length})}</strong><p>{sourceName(celebrationFirst.source)} · {multipleLocations?t("tv.allLocations"):celebrationFirst.location}</p><time>{time(celebrationFirst.at)}</time></div></>:<div className="tv-live-card"><span className="tv-live-badge">{disconnected?<WifiOff size={14}/>:<i/>}{t(disconnected?"tv.disconnected":"tv.live")}</span><div className="tv-live-symbol"><CalendarPlus/></div><strong>{t("tv.liveTitle")}</strong><p>{t(disconnected?"tv.liveOffline":"tv.liveWaiting")}</p></div>}</aside>
  </div>
  <div className="tv-middle"><section ref={locationSection} className="tv-location-section" onMouseEnter={()=>setInteracting(true)} onMouseLeave={()=>setInteracting(false)} onFocus={()=>setInteracting(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setInteracting(false);}}><div className="tv-band-heading"><h2>{t("tv.locationsOverview")}</h2>{pages>1&&<div className="tv-page-controls"><Button size="icon" variant="ghost" aria-label={t("tv.previousPage")} onClick={()=>setLocationPage((currentPage+pages-1)%pages)}><ChevronLeft size={15}/></Button><span className="tv-page-status">{t("tv.page",{page:currentPage+1,pages})}<i className="tv-page-progress" style={{width:`${progress}%`}}/></span><Button size="icon" variant="ghost" aria-label={t("tv.nextPage")} onClick={()=>setLocationPage(nextTvPage(currentPage,pages))}><ChevronRight size={15}/></Button><Button size="icon" variant="ghost" aria-label={t(paused?"tv.resume":"tv.pause")} title={t(paused?"tv.resume":"tv.pause")} onClick={()=>setPaused(v=>!v)}>{paused?<Play size={13}/>:<Pause size={13}/>}</Button></div>}</div><div className="tv-table-wrap"><table className="tv-table" style={{"--tv-slots":slots} as CSSProperties}><thead><tr>{["location","total","occupiedColumn","readyColumn","cleaning","maintenance"].map(k=><th key={k}>{t(`tv.${k}`)}</th>)}</tr></thead><tbody key={`${currentPage}-${slots}`}>{properties.map(p=><tr key={p.name}><td><div className="tv-location-cell"><span className="tv-location-name">{p.name}</span><div className="tv-occupancy"><div className="tv-occupancy-track"><div style={{width:`${p.total?p.occupied/p.total*100:0}%`}}/></div><small>{p.total?Math.round(p.occupied/p.total*100):0}%</small></div></div></td>{(["total","occupied","ready","cleaning","maintenance"] as const).map(k=><td key={k}>{p[k]}</td>)}</tr>)}{Array.from({length:Math.max(0,slots-properties.length)},(_,i)=><tr key={`empty-${i}`} className="tv-table-placeholder" aria-hidden="true"><td/></tr>)}</tbody><tfoot><tr><th>{t("tv.totalAll")}</th>{(["total","occupied","ready","cleaning","maintenance"] as const).map(k=><td key={k}>{data.totals[k]}</td>)}</tr></tfoot></table></div></section>
   <aside className="tv-side"><section className="tv-activity"><div className="tv-band-heading"><h2>{t("tv.flow")}</h2></div><div ref={eventList} className="tv-activity-list">{data.events.slice(0,eventSize).map(e=><div key={e.id} className={`tv-event ${highlight.includes(e.id)?"tv-event-new":""}`} style={{"--tv-source":e.source==="operation"?"var(--tv-success)":data.colors[normalizeChannel(e.source)]} as CSSProperties}><time>{time(e.at)}</time><i className="tv-event-dot"/><span className="tv-event-source">{sourceName(e.source)}</span><span className="tv-event-description">{t(`tv.${e.kind}`)}{e.location&&<small>{e.location}</small>}</span></div>)}{!data.events.length&&<p className="tv-no-priorities">{t("tv.noEvents")}</p>}</div></section><section className="tv-important"><div className="tv-band-heading"><h2>{t("tv.priorities")}</h2></div><dl>{priorities.filter(p=>data.priorities[p.key]>0).map(p=><div key={p.key} className={`tv-stat-row tv-stat-${p.tone}`}><dd>{data.priorities[p.key]}</dd><dt>{t(`tv.${p.key}`)}<small>{data.priorityDetails.filter(d=>d[p.key]>0).slice(0,2).map(d=>`${d.location.replace(/^Pension /,"")}: ${d[p.key]}`).join(" · ") || t(`tv.${p.key}Hint`)}</small></dt></div>)}{!priorities.some(p=>data.priorities[p.key]>0)&&<p className="tv-no-priorities">{t("tv.noPriorities")}</p>}</dl></section></aside>
  </div>
  <section className="tv-chart-section"><div className="tv-band-heading"><h2>{t("tv.week")}</h2><div className="tv-chart-legend"><span><i className="tv-chart-in"/>{t("tv.arrival")}</span><span><i className="tv-chart-out"/>{t("tv.departure")}</span></div></div><div className="tv-chart">{data.weekly.map(d=><div key={d.day} className="tv-day"><div className="tv-bars">{(["arrivals","departures"] as const).map((k,i)=><div key={k} className="tv-bar-column"><span>{d[k]}</span><div className={i===0?"tv-chart-in":"tv-chart-out"} style={{height:`${d[k]/max*72}%`}}/></div>)}</div><p>{new Intl.DateTimeFormat("de-DE",{timeZone:BUSINESS_TIME_ZONE,weekday:"short"}).format(new Date(`${d.day}T12:00:00Z`))}</p></div>)}</div></section>
  <footer className="tv-footer"><span>{t("tv.updated")}: {time(data.at)}</span><div className="tv-footer-tools"><span className="tv-footer-note">{t("tv.office")}</span><Button size="sm" variant="ghost" aria-label={t(!activated?"tv.sound":sound?"tv.mute":"tv.soundOn")} onClick={toggleSound}>{sound?<Volume2 size={15}/>:<VolumeX size={15}/>} {t(!activated?"tv.sound":sound?"tv.mute":"tv.soundOn")}</Button><label className="tv-volume">{t("tv.volume")}<input aria-label={t("tv.volume")} type="range" min="0" max="100" value={volume} onChange={e=>changeVolume(Number(e.target.value))}/><output>{volume}%</output></label></div></footer>
 </main>;
}
