-- Correctif notifications : fonction de vérification du jeton service_role. À coller dans le SQL Editor Supabase (sans danger, rejouable).
-- Sert à l'Edge Function pour vérifier qu'un jeton est bien celui du rôle service_role (seul autorisé à l'appeler).
create or replace function public.notif_ping() returns boolean language sql security definer set search_path = public stable as $$ select true $$;
revoke all on function public.notif_ping() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.notif_ping() to service_role; end if;
end $$;

