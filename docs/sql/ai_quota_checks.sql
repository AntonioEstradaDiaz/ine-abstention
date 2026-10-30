-- Atlas · Equipo Pumpkin — Verificación de docs/sql/ai_quota.sql (cuotas del asistente de IA).
--
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de aplicar ai_quota.sql.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja filas ni cambia el
-- secreto real. Usa las dos cuentas QA documentadas en el README.
-- Cada comprobación imprime "PASS: ..."; si una falla, se detiene con "FAIL: ...".
-- Resultado esperado al final: una fila con "ai_quota_checks: todo OK".

begin;

-- Secreto de prueba (40 caracteres), válido solo dentro de esta transacción.
insert into pulso_private.settings(key, value)
values ('ai_quota_secret_sha256', encode(sha256(convert_to(repeat('t', 40), 'UTF8')), 'hex'))
on conflict (key) do update set value = excluded.value;

do $$
declare
 c_secret constant text := repeat('t', 40);
 v_a uuid;
 v_b uuid;
 v_day date := (now() at time zone 'America/Mexico_City')::date;
 v_resets timestamptz := (v_day + 1)::timestamp at time zone 'America/Mexico_City';
 v_total int;
 v_res uuid;
 v_cols text;
 r jsonb;
 i int;
begin
 select id into v_a from auth.users where email = 'pulso.qa.20261025.1@example.com';
 select id into v_b from auth.users where email = 'pulso.qa.20261025.2@example.com';
 if v_a is null or v_b is null then
  raise exception 'FAIL: no existen las cuentas QA del README';
 end if;
 delete from public.pulso_ai_usage where user_id in (v_a, v_b);

 -- 1. Permisos y secreto ------------------------------------------------------------------
 perform set_config('role', 'anon', true);
 begin
  r := public.pulso_ai_reserve(c_secret);
  raise exception 'FAIL: anon pudo reservar';
 exception when insufficient_privilege then
  raise notice 'PASS: anon no puede ejecutar las funciones de cuota';
 end;

 perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
 perform set_config('role', 'authenticated', true);
 begin
  perform count(*) from public.pulso_ai_usage;
  raise exception 'FAIL: authenticated pudo leer la tabla de uso';
 exception when insufficient_privilege then
  raise notice 'PASS: la tabla de uso no se puede leer directamente';
 end;
 begin
  perform count(*) from pulso_private.settings;
  raise exception 'FAIL: authenticated pudo leer pulso_private.settings';
 exception when insufficient_privilege then
  raise notice 'PASS: el esquema privado no es accesible';
 end;
 begin
  r := public.pulso_ai_reserve(repeat('x', 40));
  raise exception 'FAIL: se aceptó un secreto incorrecto';
 exception when sqlstate '28000' then
  raise notice 'PASS: secreto incorrecto rechazado';
 end;

 perform set_config('request.jwt.claims', '', true);
 begin
  r := public.pulso_ai_quota_status();
  raise exception 'FAIL: se consultó la cuota sin sesión';
 exception when sqlstate '28000' then
  raise notice 'PASS: consultar la cuota exige sesión';
 end;

 -- 2. Cuota diaria de la cuenta A (FR-001, FR-010) ------------------------------------------
 perform set_config('role', 'none', true);
 insert into public.pulso_ai_usage(user_id, quota_day, status, created_at, finished_at)
 select v_a, v_day, 'succeeded', now() - interval '10 minutes', now() - interval '10 minutes'
 from generate_series(1, 29);

 perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
 perform set_config('role', 'authenticated', true);
 r := public.pulso_ai_reserve(c_secret);
 if not (r->>'ok')::boolean or (r->>'remaining')::int <> 0 then
  raise exception 'FAIL: la consulta 30 debía pasar con 0 restantes: %', r;
 end if;
 v_res := (r->>'reservation_id')::uuid;
 raise notice 'PASS: la consulta 30 del día pasa y deja 0 restantes';

 r := public.pulso_ai_reserve(c_secret);
 if (r->>'ok')::boolean or r->>'code' <> 'daily_limit' then
  raise exception 'FAIL: la consulta 31 debía dar daily_limit: %', r;
 end if;
 if (r->>'resets_at')::timestamptz <> v_resets
    or ((r->>'resets_at')::timestamptz at time zone 'America/Mexico_City')::time <> time '00:00' then
  raise exception 'FAIL: resets_at debía ser 00:00 de Ciudad de México del día siguiente: %', r;
 end if;
 raise notice 'PASS: la consulta 31 da daily_limit y se reinicia a las 00:00 (Ciudad de México)';

 -- 3. Aislamiento entre cuentas (FR-009) ---------------------------------------------------
 perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
 r := public.pulso_ai_quota_status();
 if (r->>'remaining')::int <> 30 then
  raise exception 'FAIL: el uso de A afectó la cuota de B: %', r;
 end if;
 r := public.pulso_ai_finish(c_secret, v_res, false);
 if (r->>'updated')::boolean then
  raise exception 'FAIL: B pudo cerrar una reserva de A';
 end if;
 raise notice 'PASS: la cuota de B es independiente y B no puede cerrar reservas de A';

 -- 4. Falla del proveedor devuelve el cupo diario (FR-007, D-008) ---------------------------
 perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
 r := public.pulso_ai_finish(c_secret, v_res, false);
 if not (r->>'updated')::boolean or (r->>'remaining')::int <> 1 then
  raise exception 'FAIL: cerrar como fallida debía devolver 1 cupo: %', r;
 end if;
 r := public.pulso_ai_finish(c_secret, v_res, true);
 if (r->>'updated')::boolean then
  raise exception 'FAIL: una reserva cerrada se pudo cerrar de nuevo';
 end if;
 r := public.pulso_ai_reserve(c_secret);
 if not (r->>'ok')::boolean then
  raise exception 'FAIL: tras la devolución, A debía poder reservar: %', r;
 end if;
 r := public.pulso_ai_finish(c_secret, (r->>'reservation_id')::uuid, true);
 if not (r->>'updated')::boolean or (r->>'remaining')::int <> 0 then
  raise exception 'FAIL: cerrar con éxito debía dejar 0 restantes: %', r;
 end if;
 raise notice 'PASS: una falla devuelve el cupo; una reserva no se cierra dos veces';

 -- 5. Ritmo por minuto, incluidas las fallidas (FR-002, D-008) ------------------------------
 perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
 for i in 1..5 loop
  r := public.pulso_ai_reserve(c_secret);
  if not (r->>'ok')::boolean then
   raise exception 'FAIL: la reserva % de B en el minuto debía pasar: %', i, r;
  end if;
  r := public.pulso_ai_finish(c_secret, (r->>'reservation_id')::uuid, false);
 end loop;
 r := public.pulso_ai_reserve(c_secret);
 if (r->>'ok')::boolean or r->>'code' <> 'rate_limit'
    or (r->>'retry_after_seconds')::int not between 1 and 60
    or (r->>'remaining')::int <> 30 then
  raise exception 'FAIL: la 6.ª en un minuto debía dar rate_limit con 30 restantes: %', r;
 end if;
 raise notice 'PASS: la 6.ª consulta en un minuto da rate_limit (% s) aunque las anteriores fallaran',
  r->>'retry_after_seconds';

 -- 6. Tope global diario (FR-003) ----------------------------------------------------------
 perform set_config('role', 'none', true);
 select count(*) into v_total from public.pulso_ai_usage where quota_day = v_day;
 insert into public.pulso_ai_usage(user_id, quota_day, status, created_at, finished_at)
 select v_a, v_day, 'failed', now() - interval '10 minutes', now() - interval '10 minutes'
 from generate_series(1, greatest(0, 500 - v_total));

 perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
 perform set_config('role', 'authenticated', true);
 r := public.pulso_ai_reserve(c_secret);
 if (r->>'ok')::boolean or r->>'code' <> 'global_limit' then
  raise exception 'FAIL: con 500 consultas en el día debía dar global_limit: %', r;
 end if;
 r := public.pulso_ai_quota_status();
 if not (r->>'global_exhausted')::boolean then
  raise exception 'FAIL: el estado debía indicar global_exhausted: %', r;
 end if;
 raise notice 'PASS: con 500 consultas en el día, nadie más puede consultar';

 -- 7. Privacidad: la tabla no guarda texto de preguntas ni respuestas (NFR-003) -------------
 perform set_config('role', 'none', true);
 select string_agg(column_name, ',' order by column_name) into v_cols
 from information_schema.columns where table_schema = 'public' and table_name = 'pulso_ai_usage';
 if v_cols <> 'created_at,finished_at,id,quota_day,status,user_id' then
  raise exception 'FAIL: columnas inesperadas en pulso_ai_usage: %', v_cols;
 end if;
 raise notice 'PASS: la tabla solo guarda cuenta, día, estado y marcas de tiempo';
end $$;

select 'ai_quota_checks: todo OK' as resultado;

rollback;
