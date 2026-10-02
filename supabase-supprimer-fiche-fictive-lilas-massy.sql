-- Supprime la fiche fictive « 12 rue des Lilas, 91300 Massy » du compte de démonstration.
-- À exécuter par Olivier dans l'éditeur SQL Supabase (Claude ne supprime jamais de données lui-même).
-- Étape 1 : lancer d'abord ce SELECT seul et vérifier qu'il montre bien 1 fiche + 1 fiche privée + 1 ouverture.
select 'agent_fiches' as table_, count(*) from agent_fiches where id = '8d38a853-505a-4b7f-94f7-9c08da9f11d6'
union all select 'fiche_private', count(*) from fiche_private where agent_user_id = 'd583214c-a703-42bd-bfc1-446ee966d573' and filename = '12-rue-des-lilas-91300-massy-d58321-FINAL.html'
union all select 'fiche_views (Massy)', count(*) from fiche_views where bien_adresse ilike '12 rue des Lilas, 91300 Massy%';

-- Étape 2 : suppression (tout ou rien).
begin;
delete from fiche_views where bien_adresse ilike '12 rue des Lilas, 91300 Massy%';
delete from fiche_private where agent_user_id = 'd583214c-a703-42bd-bfc1-446ee966d573' and filename = '12-rue-des-lilas-91300-massy-d58321-FINAL.html';
delete from agent_fiches where id = '8d38a853-505a-4b7f-94f7-9c08da9f11d6';
commit;
-- Les lignes « TEST-12 rue des Lilas, 91000 Évry-Courcouronnes » (28 ouvertures de test) ne sont PAS touchées.
-- Le fichier de la fiche sur GitHub (fiches/12-rue-des-lilas-91300-massy-d58321-FINAL.html), s'il existe encore,
-- se supprime avec le bouton 🗑️ Supprimer de la liste Mes fiches sur ce compte, avant d'exécuter ce fichier.
