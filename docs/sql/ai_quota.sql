-- Atlas · Equipo Pumpkin — Cuotas del asistente de IA (punto 5).
--
-- Límites (cambiarlos requiere una nueva versión de este archivo):
--   30 consultas por cuenta y por día · 5 por cuenta y por minuto · 500 por día en total.
--   El día se reinicia a las 00:00 de America/Mexico_City.
--   Una falla del proveedor devuelve el cupo diario de la cuenta, pero cuenta para el ritmo
--   por minuto y para el total diario, porque la consulta sí llegó al proveedor.
--
-- Seguridad:
--   - La tabla tiene RLS activa y ninguna política: nadie la lee ni la escribe directamente.
--   - Reservar y cerrar exigen un secreto que solo conoce el servidor de Next.js
--     (PULSO_AI_QUOTA_SECRET). La base guarda solo su hash SHA-256. No usa service_role.
--   - No se guarda el texto de las preguntas ni de las respuestas.
--
-- Aplicar una sola vez en el SQL Editor de Supabase. Para verificar, ejecutar después
-- docs/sql/ai_quota_checks.sql (corre dentro de una transacción que se revierte).

create table public.pulso_ai_usage (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 quota_day date not null,
 status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed')),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 check ((status = 'reserved') = (finished_at is null))
);
alter table public.pulso_ai_usage enable row level security;
revoke all on public.pulso_ai_usage from public, anon, authenticated;
create index pulso_ai_usage_day_user on public.pulso_ai_usage(quota_day, user_id);
create index pulso_ai_usage_user_created on public.pulso_ai_usage(user_id, created_at desc);

create schema pulso_private;
revoke all on schema pulso_private from public, anon, authenticated;
create table pulso_private.settings (key text primary key, value text not null);
revoke all on pulso_private.settings from public, anon, authenticated;

create function pulso_private.ai_limits(out daily int, out per_minute int, out global_daily int)
language sql immutable set search_path = '' as $$ select 30, 5, 500 $$;

create function pulso_private.ai_day() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Mexico_City')::date $$;

create function pulso_private.ai_resets_at(p_day date) returns timestamptz
language sql stable set search_path = '' as $$ select (p_day + 1)::timestamp at time zone 'America/Mexico_City' $$;

create function pulso_private.ai_require(p_secret text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
 v_expected text;
 v_uid uuid := auth.uid();
begin
 select value into v_expected from pulso_private.settings where key = 'ai_quota_secret_sha256';
 if v_expected is null or p_secret is null or char_length(p_secret) < 32
    or encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') <> v_expected then
  raise exception 'pulso_ai: secreto inválido' using errcode = '28000';
 end if;
 if v_uid is null then
  raise exception 'pulso_ai: sin sesión' using errcode = '28000';
 end if;
 return v_uid;
end $$;

create function pulso_private.ai_status(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
 v_lim record := pulso_private.ai_limits();
 v_day date := pulso_private.ai_day();
 v_used int;
 v_total int;
begin
 select count(*) into v_used from public.pulso_ai_usage
  where user_id = p_uid and quota_day = v_day and status in ('reserved', 'succeeded');
 select count(*) into v_total from public.pulso_ai_usage where quota_day = v_day;
 return jsonb_build_object(
  'limit', v_lim.daily,
  'remaining', greatest(0, v_lim.daily - v_used),
  'resets_at', pulso_private.ai_resets_at(v_day),
  'global_exhausted', v_total >= v_lim.global_daily);
end $$;

-- Reserva un cupo antes de llamar al proveedor. Devuelve ok=true con reservation_id,
-- u ok=false con code daily_limit | global_limit | rate_limit.
create function public.pulso_ai_reserve(p_secret text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
 v_uid uuid := pulso_private.ai_require(p_secret);
 v_lim record := pulso_private.ai_limits();
 v_day date := pulso_private.ai_day();
 v_resets timestamptz := pulso_private.ai_resets_at(v_day);
 v_used int;
 v_total int;
 v_recent int;
 v_oldest timestamptz;
 v_id uuid;
begin
 -- Serializa todas las reservas: los tres límites son exactos aun con varias instancias.
 perform pg_advisory_xact_lock(hashtextextended('pulso_ai_quota', 0));
 select count(*) into v_used from public.pulso_ai_usage
  where user_id = v_uid and quota_day = v_day and status in ('reserved', 'succeeded');
 if v_used >= v_lim.daily then
  return jsonb_build_object('ok', false, 'code', 'daily_limit', 'limit', v_lim.daily,
   'remaining', 0, 'resets_at', v_resets);
 end if;
 select count(*) into v_total from public.pulso_ai_usage where quota_day = v_day;
 if v_total >= v_lim.global_daily then
  return jsonb_build_object('ok', false, 'code', 'global_limit', 'limit', v_lim.daily,
   'remaining', v_lim.daily - v_used, 'resets_at', v_resets);
 end if;
 select count(*), min(created_at) into v_recent, v_oldest from public.pulso_ai_usage
  where user_id = v_uid and created_at > now() - interval '1 minute';
 if v_recent >= v_lim.per_minute then
  return jsonb_build_object('ok', false, 'code', 'rate_limit', 'limit', v_lim.daily,
   'remaining', v_lim.daily - v_used, 'resets_at', v_resets,
   'retry_after_seconds',
   greatest(1, ceil(extract(epoch from v_oldest + interval '1 minute' - now()))::int));
 end if;
 insert into public.pulso_ai_usage(user_id, quota_day) values (v_uid, v_day) returning id into v_id;
 return jsonb_build_object('ok', true, 'reservation_id', v_id, 'limit', v_lim.daily,
  'remaining', v_lim.daily - v_used - 1, 'resets_at', v_resets);
end $$;

-- Cierra una reserva propia, abierta y de menos de 5 minutos. p_succeeded=false devuelve el cupo diario.
create function public.pulso_ai_finish(p_secret text, p_reservation uuid, p_succeeded boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
 v_uid uuid := pulso_private.ai_require(p_secret);
 v_updated int;
begin
 if p_succeeded is null then
  raise exception 'pulso_ai: resultado requerido' using errcode = '22004';
 end if;
 update public.pulso_ai_usage
  set status = case when p_succeeded then 'succeeded' else 'failed' end, finished_at = now()
  where id = p_reservation and user_id = v_uid and status = 'reserved'
   and created_at > now() - interval '5 minutes';
 get diagnostics v_updated = row_count;
 return pulso_private.ai_status(v_uid) || jsonb_build_object('updated', v_updated = 1);
end $$;

-- Cuota de la cuenta con sesión. Solo lectura de conteos propios; no requiere el secreto.
create function public.pulso_ai_quota_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
 v_uid uuid := auth.uid();
begin
 if v_uid is null then
  raise exception 'pulso_ai: sin sesión' using errcode = '28000';
 end if;
 return pulso_private.ai_status(v_uid);
end $$;

revoke all on all functions in schema pulso_private from public, anon, authenticated;
revoke all on function public.pulso_ai_reserve(text) from public, anon;
revoke all on function public.pulso_ai_finish(text, uuid, boolean) from public, anon;
revoke all on function public.pulso_ai_quota_status() from public, anon;
grant execute on function public.pulso_ai_reserve(text) to authenticated;
grant execute on function public.pulso_ai_finish(text, uuid, boolean) to authenticated;
grant execute on function public.pulso_ai_quota_status() to authenticated;
notify pgrst, 'reload schema';

-- Secreto del servidor (una vez, y al rotarlo). Generarlo fuera de Supabase, por ejemplo:
--   node -e "const c=require('crypto');const s=c.randomBytes(32).toString('base64url');console.log('PULSO_AI_QUOTA_SECRET='+s);console.log('sha256='+c.createHash('sha256').update(s).digest('hex'))"
-- Guardar PULSO_AI_QUOTA_SECRET en Vercel (solo servidor) y pegar aquí SOLO el hash:
--   insert into pulso_private.settings(key, value) values ('ai_quota_secret_sha256', '<sha256>')
--   on conflict (key) do update set value = excluded.value;

-- Consumo del día para el equipo (SQL Editor, rol de administrador):
--   select user_id,
--          count(*) filter (where status <> 'failed') as consumidas,
--          count(*) filter (where status = 'failed') as fallidas
--   from public.pulso_ai_usage
--   where quota_day = (now() at time zone 'America/Mexico_City')::date
--   group by user_id order by consumidas desc;

-- Reversión:
--   drop function public.pulso_ai_reserve(text), public.pulso_ai_finish(text, uuid, boolean),
--     public.pulso_ai_quota_status();
--   drop table public.pulso_ai_usage;
--   drop schema pulso_private cascade;
