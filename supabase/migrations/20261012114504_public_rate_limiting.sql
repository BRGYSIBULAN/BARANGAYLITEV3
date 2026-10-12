-- Purpose: rate-limit only the four anonymous BRGYWEBLITEV3 RPC entry points
-- without changing IDs, QR tokens, resident rows, accounts, or public results.
-- Depends on: the existing private schema, pgcrypto in extensions, PostgREST
-- request headers, and the existing verification/private lookup functions.
-- Debug: a RATE_LIMITED / HTTP 429 response includes Retry-After; inspect only
-- aggregate counter rows and never log request headers, names, IDs, or QR tokens.

create table if not exists private.public_rate_limits (
  endpoint text not null,
  client_fingerprint text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null,
  primary key (endpoint, client_fingerprint)
);

comment on table private.public_rate_limits is
  'Short-lived abuse counters. Client IP and user-agent are SHA-256 hashed before storage.';

alter table private.public_rate_limits enable row level security;
revoke all on table private.public_rate_limits from public, anon, authenticated, service_role;

create index if not exists public_rate_limits_updated_at_idx
  on private.public_rate_limits (updated_at);

-- This helper is callable only through the same Data API roles as the protected
-- RPCs. Its endpoint allowlist owns every limit, so a browser cannot raise its
-- allowance by supplying a number or interval.
create or replace function public.enforce_public_rate_limit(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
  v_headers jsonb;
  v_client_ip text;
  v_user_agent text;
  v_fingerprint text;
  v_limit integer;
  v_window interval;
  v_now timestamptz := statement_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
  v_retry_after integer;
begin
  -- Management/service calls are not public traffic and must remain available
  -- for deployment verification and emergency recovery.
  if coalesce(v_claims ->> 'role', '') not in ('anon', 'authenticated') then
    return;
  end if;

  case p_endpoint
    when 'verification.manual' then
      v_limit := 15;
      v_window := interval '10 minutes';
    when 'verification.qr' then
      v_limit := 120;
      v_window := interval '10 minutes';
    when 'application.eligibility' then
      v_limit := 8;
      v_window := interval '1 hour';
    when 'metrics.public' then
      v_limit := 300;
      v_window := interval '10 minutes';
    else
      raise exception using
        errcode = '22023',
        message = 'Unsupported public rate-limit endpoint.';
  end case;

  v_headers := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  -- Supabase/PostgREST supplies x-forwarded-for. Fallback headers prevent one
  -- missing field from disabling the limit; raw network values are never saved.
  v_client_ip := nullif(btrim(split_part(coalesce(
    v_headers ->> 'x-forwarded-for',
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    'unknown'
  ), ',', 1)), '');
  v_user_agent := left(coalesce(v_headers ->> 'user-agent', 'unknown'), 256);
  v_fingerprint := encode(
    extensions.digest(coalesce(v_client_ip, 'unknown') || '|' || v_user_agent, 'sha256'),
    'hex'
  );

  -- One mutable row per endpoint/fingerprint keeps storage small. The upsert is
  -- atomic, so simultaneous requests cannot all pass by reading the same count.
  insert into private.public_rate_limits as rate (
    endpoint,
    client_fingerprint,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_endpoint,
    v_fingerprint,
    v_now,
    1,
    v_now
  )
  on conflict (endpoint, client_fingerprint) do update
    set window_started_at = case
          when rate.window_started_at + v_window <= v_now then v_now
          else rate.window_started_at
        end,
        request_count = case
          when rate.window_started_at + v_window <= v_now then 1
          else rate.request_count + 1
        end,
        updated_at = v_now
  returning rate.window_started_at, rate.request_count
    into v_window_started_at, v_request_count;

  -- Occasional cleanup avoids a scheduled job and removes inactive fingerprints.
  -- A blocked request rolls back this cleanup, which is harmless because later
  -- allowed requests continue the best-effort housekeeping.
  if random() < 0.01 then
    delete from private.public_rate_limits
    where updated_at < v_now - interval '2 days';
  end if;

  if v_request_count > v_limit then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_started_at + v_window - v_now)))::integer
    );
    -- PGRST preserves HTTP 429 and Retry-After, while the public UI receives a
    -- generic message that reveals no counter, IP, resident, or token details.
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'RATE_LIMITED',
        'message', 'Too many requests. Please wait before trying again.',
        'details', null,
        'hint', null
      )::text,
      detail = json_build_object(
        'status', 429,
        'headers', json_build_object('Retry-After', v_retry_after::text)
      )::text;
  end if;
end;
$$;

comment on function public.enforce_public_rate_limit(text) is
  'Fixed-window limiter for allowlisted public RPCs; stores only hashed client fingerprints.';

revoke all on function public.enforce_public_rate_limit(text)
  from public, anon, authenticated, service_role;
grant execute on function public.enforce_public_rate_limit(text)
  to anon, authenticated, service_role;

-- Preserve the original manual verification signature and returned fields.
create or replace function public.verify_barangay_record(
  p_control_number text,
  p_last_name text
)
returns table(
  control_number text,
  full_name text,
  designation text,
  date_acquired date,
  expiration_date date,
  status text
)
language plpgsql
set search_path to 'public', 'verification_private', 'pg_temp'
as $$
begin
  perform public.enforce_public_rate_limit('verification.manual');
  if p_control_number is null or p_last_name is null then
    return;
  end if;
  if length(trim(p_control_number)) < 4 or length(trim(p_control_number)) > 40 then
    return;
  end if;
  if trim(p_control_number) !~ '^[A-Za-z0-9-]+$' then
    return;
  end if;
  if length(trim(p_last_name)) < 1 or length(trim(p_last_name)) > 80 then
    return;
  end if;
  return query
  select * from verification_private.lookup_record(trim(p_control_number), trim(p_last_name));
end;
$$;

-- Preserve every distributed UUID and legacy QR URL; only request frequency changes.
create or replace function public.verify_barangay_record_qr(p_token text)
returns table(
  control_number text,
  full_name text,
  designation text,
  date_acquired date,
  expiration_date date,
  status text
)
language plpgsql
set search_path to 'public', 'verification_private', 'pg_temp'
as $$
begin
  perform public.enforce_public_rate_limit('verification.qr');
  if p_token is null or trim(p_token) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return;
  end if;
  return query
  select * from verification_private.lookup_record_by_qr(trim(p_token)::uuid);
end;
$$;

-- The applicant-name check already exposes only a boolean; it now also resists
-- repeated name enumeration without changing the application workflow.
create or replace function public.can_apply_content_admin(candidate_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
begin
  perform public.enforce_public_rate_limit('application.eligibility');
  return private.content_admin_name_exists(candidate_name);
end;
$$;

-- Public counters stay approximate and privacy-safe, with a generous ceiling
-- that blocks automated inflation without affecting normal page navigation.
create or replace function public.record_public_metric(p_metric_key text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  allowed constant text[] := array[
    'page.home','page.announcements','page.services','page.appointment','page.forms','page.contact','page.pages',
    'page.officials','page.staff','page.functionaries','page.disclosures','page.gallery_items','page.directory_entries','page.verify',
    'download.forms','download.disclosures','verify.manual.match','verify.manual.no_match','verify.qr.match','verify.qr.no_match'
  ];
begin
  perform public.enforce_public_rate_limit('metrics.public');
  if p_metric_key is null or p_metric_key <> all (allowed) then
    return false;
  end if;
  insert into public.public_daily_metrics (metric_date, metric_key, event_count, updated_at)
  values ((now() at time zone 'Asia/Manila')::date, p_metric_key, 1, now())
  on conflict (metric_date, metric_key) do update
    set event_count = public.public_daily_metrics.event_count + 1,
        updated_at = now();
  return true;
end;
$$;

-- Reassert only the existing callers. PostgreSQL otherwise grants EXECUTE to
-- PUBLIC by default when functions are created or replaced.
revoke all on function public.verify_barangay_record(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_barangay_record(text, text)
  to anon, authenticated, service_role;

revoke all on function public.verify_barangay_record_qr(text)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_barangay_record_qr(text)
  to anon, authenticated, service_role;

revoke all on function public.can_apply_content_admin(text)
  from public, anon, authenticated, service_role;
grant execute on function public.can_apply_content_admin(text)
  to anon, authenticated, service_role;

revoke all on function public.record_public_metric(text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_public_metric(text)
  to anon, authenticated, service_role;
