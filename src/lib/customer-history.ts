export type CustomerKind='person'|'company';
export type CustomerParty={id:string;kind:CustomerKind;name:string;email:string|null;phone:string|null;vat:string|null;address:string|null;contact:string|null};
export type CustomerStay={id:string;booking_id:string|null;check_in:string;check_out:string;status:string;property_id:string;property:string;room:string;guests_count:number;payer_id:string|null;payer_name:string|null;payer_kind:CustomerKind|null;people:{id:string;name:string}[];finance?:{revenue:number;paid:number;advance:number;deposit:number;schedules:{id:string;due_date:string;kind:string;amount:number;paid:number}[]}};
export type CustomerCard={party_id:string|null;identity_key:string;customer_type:CustomerKind;name:string;company:string|null;email:string|null;phone:string|null;vat:string|null;address:string|null;contact:string|null;unresolved:boolean;stays:number;last_stay:string|null;reservations:CustomerStay[]};
export type CustomerHistory={org:string;total:number;rows:CustomerCard[]};
export type CustomerFilters={kind:CustomerKind;search:string;property?:string;from?:string;to?:string;active:boolean;page:number;size:10|20|30|40|50;party?:string;status?:string;person?:string};
export function customerFinance(stays:CustomerStay[],today:string){
 const unique=[...new Map(stays.map(s=>[s.id,s])).values()];
 return unique.reduce((sum,s)=>{if(!s.finance)return sum;const f=s.finance;sum.revenue+=Number(f.revenue);sum.paid+=Number(f.paid);sum.advance+=Number(f.advance);sum.deposit+=Number(f.deposit);for(const p of f.schedules){if(p.kind==='rent'){sum.remaining+=Math.max(0,Number(p.amount)-Number(p.paid));if(p.due_date<=today)sum.due+=Math.max(0,Number(p.amount)-Number(p.paid));}}return sum;},{revenue:0,paid:0,advance:0,deposit:0,due:0,remaining:0});
}