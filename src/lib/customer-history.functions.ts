import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { CustomerHistory } from './customer-history';
export const loadCustomerHistory=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({kind:z.enum(['person','company']),search:z.string().max(120),property:z.string().uuid().optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),active:z.boolean(),page:z.number().int().min(0),size:z.union([z.literal(10),z.literal(20),z.literal(30),z.literal(40),z.literal(50)]),party:z.string().uuid().optional(),status:z.string().optional(),person:z.string().uuid().optional()})).handler(async({data,context})=>{
 const result=await context.supabase.rpc('customer_history',{_kind:data.kind,_search:data.search,_property:data.property,_from:data.from,_to:data.to,_active:data.active,_page:data.page,_size:data.size,_party:data.party,_status:data.status,_person:data.person});if(result.error)throw Error('customer_history_unavailable');return result.data as unknown as CustomerHistory;
});