-- Guide « Vivre à [ville] » : cache commun par commune — À EXÉCUTER dans l'éditeur SQL Supabase (rejouable).
-- Une ligne par code INSEE, écrite UNE SEULE FOIS par api/guide-commune.js (clé service_role côté serveur) ;
-- réutilisée par toutes les fiches de la commune. Les modifications et masquages de l'agent restent dans sa fiche
-- (jamais ici). Aucune donnée personnelle.
create table if not exists public.guide_commune (
  insee      text primary key check (insee ~ '^([0-9]{5}|2[AB][0-9]{3})$'),
  commune    text not null,
  rubriques  jsonb not null default '[]'::jsonb,   -- [{cle, titre, texte, sources: [{type, titre, url, licence?}], extrait}] (extrait : passage exact de la source)
  modele     text,
  genere_le  timestamptz not null default now()
);
comment on table public.guide_commune is 'Guide « Vivre à [ville] » par commune (cache commun, écrit une fois par le serveur).';

-- Réservé au serveur (service_role) : aucune politique pour anon ni authenticated.
alter table public.guide_commune enable row level security;
revoke all on public.guide_commune from anon, authenticated;

-- Pour régénérer une commune (après une mise à jour de Wikipédia, par exemple) : supprimer sa ligne.
--   delete from public.guide_commune where insee = '91345';
