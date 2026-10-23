import { describe,it,expect } from 'vitest';
import { customerFinance,type CustomerStay } from './customer-history';
const stay:CustomerStay={id:'a',booking_id:null,check_in:'2026-10-01',check_out:'2026-11-01',status:'confirmed',property_id:'p',property:'P',room:'1',guests_count:1,payer_id:'company',payer_name:'ABC',payer_kind:'company',people:[],finance:{revenue:100,paid:20,advance:10,deposit:50,schedules:[{id:'s',due_date:'2026-10-01',kind:'rent',amount:100,paid:20}]}};
describe('customer finance totals',()=>{
 it('does not double-count a payment from repeated views',()=>expect(customerFinance([stay,stay],'2026-10-23').paid).toBe(20));
 it('keeps rent, advances and deposits separate',()=>expect(customerFinance([stay],'2026-10-23')).toEqual({revenue:100,paid:20,advance:10,deposit:50,due:80,remaining:80}));
 it('does not fabricate money for a non-financial guest view',()=>expect(customerFinance([{...stay,finance:undefined}],'2026-10-23').revenue).toBe(0));
 it('does not make future installments due',()=>expect(customerFinance([{...stay,finance:{...stay.finance,revenue:100,paid:20,advance:10,deposit:50,schedules:[{id:'s',due_date:'2026-11-01',kind:'rent',amount:100,paid:20}]}}],'2026-10-23').due).toBe(0));
});