-- Purpose: preserve field-level ID changes independently of deletable activity logs.
-- Depends on: existing verification_records, profiles, and private.current_user_has_role.
-- Debug: check the trigger, admin SELECT policy, and allowlisted fields; QR tokens are never logged.
create table public.verification_record_history (
  id bigint generated always as identity primary key,
  record_id bigint not null,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_user_id uuid,
  actor_name text not null,
  actor_role text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb not null,
  new_values jsonb not null
);
-- No cascading foreign keys: deleting an ID or staff account must not erase its audit trail.
create index verification_history_record_time_idx
  on public.verification_record_history (record_id, occurred_at desc, id desc);
alter table public.verification_record_history enable row level security;
revoke all on public.verification_record_history from public, anon, authenticated;
grant select on public.verification_record_history to authenticated;
create policy verification_history_admin_read on public.verification_record_history
  for select to authenticated
  using (private.current_user_has_role(array['admin']::public.app_role[]));

-- The private trigger needs owner privileges only to append audit rows; clients receive no write grant.
-- It can run only as a row trigger, derives the actor from auth.uid(), and uses fully qualified objects.
create function private.log_verification_record_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  after_row jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  before_changes jsonb := '{}'::jsonb;
  after_changes jsonb := '{}'::jsonb;
  field text;
  actor uuid := auth.uid();
  actor_label text;
  actor_kind text;
begin
  -- Only ID-editor fields are recorded. Directory-only, timestamp-only and QR changes are excluded.
  foreach field in array array['control_number','first_name','middle_name','last_name','designation','date_acquired','expiration_date','status'] loop
    if tg_op <> 'UPDATE' or (before_row->field) is distinct from (after_row->field) then
      if tg_op <> 'INSERT' then before_changes := before_changes || jsonb_build_object(field, before_row->field); end if;
      if tg_op <> 'DELETE' then after_changes := after_changes || jsonb_build_object(field, after_row->field); end if;
    end if;
  end loop;
  if tg_op = 'UPDATE' and before_changes = '{}'::jsonb then return new; end if;
  select coalesce(nullif(p.display_name, ''), p.role::text), p.role::text
    into actor_label, actor_kind from public.profiles p where p.user_id = actor;
  insert into public.verification_record_history
    (record_id, actor_user_id, actor_name, actor_role, operation, old_values, new_values)
  values (
    coalesce((after_row->>'id')::bigint, (before_row->>'id')::bigint), actor,
    coalesce(actor_label, case when actor is null then 'System / database operation' else 'Unknown staff account' end),
    coalesce(actor_kind, case when actor is null then 'system' else 'unknown' end),
    tg_op, before_changes, after_changes
  );
  -- Audit insertion shares the record transaction; a rolled-back write cannot leave false history.
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.log_verification_record_history() from public, anon, authenticated;
create trigger audit_verification_record_history
  after insert or update or delete on public.verification_records
  for each row execute function private.log_verification_record_history();
