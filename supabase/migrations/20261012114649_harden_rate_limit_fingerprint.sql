-- Purpose: bind the public rate limit to the caller IP alone so rotating a
-- browser user-agent cannot create a fresh allowance.
-- Depends on: 20261012114504_public_rate_limiting.sql and PostgREST's trusted
-- x-forwarded-for request header documented by Supabase.
-- Debug: RATE_LIMITED remains HTTP 429; no raw IP address is stored or logged.

comment on table private.public_rate_limits is
  'Short-lived abuse counters. Client IP is SHA-256 hashed before storage.';

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
  -- Supabase documents the first x-forwarded-for value as the client IP for
  -- Data API rate limiting. Fallbacks fail closed if a proxy header is absent.
  v_client_ip := nullif(btrim(split_part(coalesce(
    v_headers ->> 'x-forwarded-for',
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    'unknown'
  ), ',', 1)), '');
  v_fingerprint := encode(
    extensions.digest(coalesce(v_client_ip, 'unknown'), 'sha256'),
    'hex'
  );

  -- One mutable row per endpoint/fingerprint keeps storage small. The upsert is
  -- atomic, so simultaneous requests cannot all pass on the same count.
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

  if random() < 0.01 then
    delete from private.public_rate_limits
    where updated_at < v_now - interval '2 days';
  end if;

  if v_request_count > v_limit then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_started_at + v_window - v_now)))::integer
    );
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

revoke all on function public.enforce_public_rate_limit(text)
  from public, anon, authenticated, service_role;
grant execute on function public.enforce_public_rate_limit(text)
  to anon, authenticated, service_role;
