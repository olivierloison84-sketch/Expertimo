-- Codes d'essai gratuit (30 jours, sans carte bancaire), à usage unique.
-- Lecture/écriture uniquement côté serveur (clé service, qui contourne la RLS) :
-- RLS activée SANS aucune policy et droits retirés à anon/authenticated.
create table if not exists public.codes_essai (
  code        text primary key,
  utilise_par uuid references auth.users(id) on delete set null,
  utilise_le  date,
  cree_le     timestamptz not null default now(),
  constraint codes_essai_code_majuscules check (code = upper(code))
);

-- Un agent ne peut consommer qu'un seul code (garde-fou en base, même en cas de requêtes simultanées).
create unique index if not exists codes_essai_utilise_par_uniq
  on public.codes_essai (utilise_par) where utilise_par is not null;

alter table public.codes_essai enable row level security;
revoke all on public.codes_essai from anon, authenticated;

-- Créer un code (toujours en MAJUSCULES) :
--   insert into public.codes_essai (code) values ('ESSAI-TEST-001');
