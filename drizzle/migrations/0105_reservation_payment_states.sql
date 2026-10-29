create or replace function public.reservation_payment_states(_org uuid, _reservation_ids uuid[])
returns table (reservation_id uuid, state text)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select r.id as rid, r.property_id
    from public.reservations r
    where r.organization_id = _org
      and r.id = any(_reservation_ids)
      and public.can_access_property(r.property_id)
  ),
  sched as (
    select s.reservation_id, sum(s.amount) as total
    from public.payment_schedules s
    join scoped on scoped.rid = s.reservation_id
    where s.kind = 'rent'
    group by s.reservation_id
  ),
  paid as (
    select p.reservation_id, sum(p.amount) as paid
    from public.payments p
    join scoped on scoped.rid = p.reservation_id
    where p.reversed_at is null and p.kind <> 'deposit'
    group by p.reservation_id
  )
  select sc.rid,
    case
      when coalesce(sc2.total, 0) > 0 and coalesce(p2.paid, 0) >= sc2.total - 0.005 then 'paid'
      when coalesce(p2.paid, 0) > 0 then 'partial'
      else 'open'
    end::text
  from scoped sc
  left join sched sc2 on sc2.reservation_id = sc.rid
  left join paid p2 on p2.reservation_id = sc.rid;
$$;

revoke execute on function public.reservation_payment_states(uuid, uuid[]) from anon;
grant execute on function public.reservation_payment_states(uuid, uuid[]) to authenticated;
