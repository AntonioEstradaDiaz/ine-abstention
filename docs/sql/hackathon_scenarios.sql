create table public.pulso_scenarios (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 state_code text not null check (state_code ~ '^[0-9]{2}$'),
 name text not null check (char_length(name) between 1 and 160),
 result jsonb not null check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 65536),
 created_at timestamptz not null default now()
);
alter table public.pulso_scenarios enable row level security;
revoke all on public.pulso_scenarios from anon, authenticated;
grant select, insert on public.pulso_scenarios to authenticated;
create policy scenarios_owner_read on public.pulso_scenarios for select to authenticated using ((select auth.uid()) = user_id);
create policy scenarios_owner_insert on public.pulso_scenarios for insert to authenticated with check ((select auth.uid()) = user_id);
create index pulso_scenarios_owner_created on public.pulso_scenarios(user_id, created_at desc);
notify pgrst, 'reload schema';
