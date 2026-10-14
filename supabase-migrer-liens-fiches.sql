-- Migration des liens de fiches vers ville-type-code6.html (23 fiches).
-- À exécuter par Olivier dans l'éditeur SQL Supabase. Claude n'exécute rien.
-- Ordre : 1) fusionner la PR (les nouveaux fichiers et les redirections sont en ligne)  2) étape 1 (SELECT)  3) étape 2 (UPDATE).
-- Les anciens fichiers restent en ligne comme pages de redirection : les liens déjà envoyés continuent de fonctionner.

-- ── Étape 1 : vérification (lecture seule) — fiches concernées, propriétaire, ancien -> nouveau nom ──
with mig(ancien, nouveau) as (values
  ('1-rue-basse-saint-maurice-77130-montereau-fault-yonne-b90f9e-FINAL.html', 'montereau-fault-yonne-appartement-u9d2eg.html'),
  ('10-bis-avenue-du-marechal-foch-91660-le-merevillois-FINAL.html', 'le-merevillois-maison-zbuhdm.html'),
  ('10-place-eugene-pottier-saint-michel-sur-orge-91240-FINAL.html', 'saint-michel-sur-orge-maison-mw6kk3.html'),
  ('10-rue-jean-colin-91160-longjumeau-FINAL.html', 'longjumeau-appartement-bzl1m5.html'),
  ('11-square-jean-baptiste-clement-91390-morsang-sur-orge-FINAL.html', 'morsang-sur-orge-appartement-w8g2eh.html'),
  ('110-avenue-philippe-auguste-paris-75011-roquette-FINAL.html', 'paris-appartement-21uwbh.html'),
  ('12-rue-des-acacias-91300-massy-FINAL.html', 'massy-appartement-3dltjv.html'),
  ('15-square-jean-baptiste-clement-91390-morsang-sur-orge-FINAL.html', 'morsang-sur-orge-appartement-kzwbj4.html'),
  ('17-rue-henri-barbusse-91380-chilly-mazarin-FINAL.html', 'chilly-mazarin-terrain-cpu8sp.html'),
  ('19-rue-elsa-triolet-91160-saulx-les-chartreux-79e4e4-FINAL.html', 'saulx-les-chartreux-appartement-zubzwj.html'),
  ('2-allee-du-vivier-sud-91410-saint-escobille-FINAL.html', 'saint-escobille-maison-uq1z9j.html'),
  ('2-bis-rue-charles-bernard-94290-villeneuve-le-roi-FINAL.html', 'villeneuve-le-roi-maison-nuwmta.html'),
  ('20-rue-francois-mouthon-91380-chilly-mazarin-FINAL.html', 'chilly-mazarin-appartement-prpu96.html'),
  ('27-rue-jean-jaures-91160-champlan-FINAL.html', 'champlan-appartement-2n4j0f.html'),
  ('29-domaine-du-chateau-91380-chilly-mazarin-FINAL.html', 'chilly-mazarin-appartement-l3n67m.html'),
  ('30-rue-gustave-legrand-91160-longjumeau-79e4e4-FINAL.html', 'longjumeau-appartement-dyb73c.html'),
  ('34-rue-helene-boucher-91300-massy-FINAL.html', 'massy-maison-3m8asn.html'),
  ('41-rue-du-four-a-pain-91160-longjumeau-FINAL.html', 'longjumeau-maison-kkzc7a.html'),
  ('42-boulevard-du-docteur-cathelin-91160-longjumeau-79e4e4-FINAL.html', 'longjumeau-maison-z2l4ug.html'),
  ('50-avenue-saint-marc-massy-91300-FINAL.html', 'massy-appartement-1ck2xo.html'),
  ('7-rue-du-repos-91380-chilly-mazarin-FINAL.html', 'chilly-mazarin-maison-kqlg9l.html'),
  ('81-rue-de-gravigny-91380-chilly-mazarin-79e4e4-FINAL.html', 'chilly-mazarin-appartement-g4kjp0.html'),
  ('84-rue-du-president-francois-mitterrand-91160-longjumeau-FINAL.html', 'longjumeau-appartement-tprw7b.html')
)
select af.agent_user_id, m.ancien, m.nouveau,
       (select count(*) from fiche_views v where v.fiche_path = '/fiches/' || m.ancien) as vues,
       (select count(*) from fiche_private p where p.agent_user_id = af.agent_user_id and p.filename = m.ancien) as fiche_privee
from mig m left join agent_fiches af on af.filename = m.ancien
order by af.agent_user_id nulls first, m.ancien;
-- Attendu : 23 lignes, aucun agent_user_id vide. Une ligne sans agent_user_id = fiche absente de agent_fiches (rien ne sera mis à jour pour elle).

-- ── Étape 2 : migration (tout ou rien). Ne lancer qu'après avoir vérifié l'étape 1 ──
begin;
create temp table mig(ancien text primary key, nouveau text not null unique) on commit drop;
insert into mig(ancien, nouveau) values
  ('1-rue-basse-saint-maurice-77130-montereau-fault-yonne-b90f9e-FINAL.html', 'montereau-fault-yonne-appartement-u9d2eg.html'),
  ('10-bis-avenue-du-marechal-foch-91660-le-merevillois-FINAL.html', 'le-merevillois-maison-zbuhdm.html'),
  ('10-place-eugene-pottier-saint-michel-sur-orge-91240-FINAL.html', 'saint-michel-sur-orge-maison-mw6kk3.html'),
  ('10-rue-jean-colin-91160-longjumeau-FINAL.html', 'longjumeau-appartement-bzl1m5.html'),
  ('11-square-jean-baptiste-clement-91390-morsang-sur-orge-FINAL.html', 'morsang-sur-orge-appartement-w8g2eh.html'),
  ('110-avenue-philippe-auguste-paris-75011-roquette-FINAL.html', 'paris-appartement-21uwbh.html'),
  ('12-rue-des-acacias-91300-massy-FINAL.html', 'massy-appartement-3dltjv.html'),
  ('15-square-jean-baptiste-clement-91390-morsang-sur-orge-FINAL.html', 'morsang-sur-orge-appartement-kzwbj4.html'),
  ('17-rue-henri-barbusse-91380-chilly-mazarin-FINAL.html', 'chilly-mazarin-terrain-cpu8sp.html'),
  ('19-rue-elsa-triolet-91160-saulx-les-chartreux-79e4e4-FINAL.html', 'saulx-les-chartreux-appartement-zubzwj.html'),
  ('2-allee-du-vivier-sud-91410-saint-escobille-FINAL.html', 'saint-escobille-maison-uq1z9j.html'),
  ('2-bis-rue-charles-bernard-94290-villeneuve-le-roi-FINAL.html', 'villeneuve-le-roi-maison-nuwmta.html'),
  ('20-rue-francois-mouthon-91380-chilly-mazarin-FINAL.html', 'chilly-mazarin-appartement-prpu96.html'),
  ('27-rue-jean-jaures-91160-champlan-FINAL.html', 'champlan-appartement-2n4j0f.html'),
  ('29-domaine-du-chateau-91380-chilly-mazarin-FINAL.html', 'chilly-mazarin-appartement-l3n67m.html'),
  ('30-rue-gustave-legrand-91160-longjumeau-79e4e4-FINAL.html', 'longjumeau-appartement-dyb73c.html'),
  ('34-rue-helene-boucher-91300-massy-FINAL.html', 'massy-maison-3m8asn.html'),
  ('41-rue-du-four-a-pain-91160-longjumeau-FINAL.html', 'longjumeau-maison-kkzc7a.html'),
  ('42-boulevard-du-docteur-cathelin-91160-longjumeau-79e4e4-FINAL.html', 'longjumeau-maison-z2l4ug.html'),
  ('50-avenue-saint-marc-massy-91300-FINAL.html', 'massy-appartement-1ck2xo.html'),
  ('7-rue-du-repos-91380-chilly-mazarin-FINAL.html', 'chilly-mazarin-maison-kqlg9l.html'),
  ('81-rue-de-gravigny-91380-chilly-mazarin-79e4e4-FINAL.html', 'chilly-mazarin-appartement-g4kjp0.html'),
  ('84-rue-du-president-francois-mitterrand-91160-longjumeau-FINAL.html', 'longjumeau-appartement-tprw7b.html');

-- Nom de fichier : « Partager », « Modifier », suppression, liste « Mes fiches »
update agent_fiches af set filename = m.nouveau, published_url = 'https://espace.privency.fr/fiches/' || m.nouveau, updated_at = now()
  from mig m where af.filename = m.ancien;
update fiche_private p set filename = m.nouveau from mig m where p.filename = m.ancien;
update vendeur_liens v set filename = m.nouveau from mig m where v.filename = m.ancien;

-- Historique des statistiques : fiche_path = '/fiches/' || nom de fichier
update fiche_views t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;
update fiche_sessions t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;
update fiche_questions t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;
update fiche_demandes_documents t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;
update fiche_retours t set fiche_path = '/fiches/' || m.nouveau from mig m where t.fiche_path = '/fiches/' || m.ancien;

-- Contrôle : doit renvoyer 0 ligne (aucune référence à un ancien nom)
select 'agent_fiches' as t, count(*) from agent_fiches where filename in (select ancien from mig)
union all select 'fiche_private', count(*) from fiche_private where filename in (select ancien from mig)
union all select 'fiche_views', count(*) from fiche_views where fiche_path in (select '/fiches/' || ancien from mig);
commit;
-- Retour arrière : relancer l'étape 2 en inversant ancien/nouveau (les anciens fichiers de redirection restent en place).
