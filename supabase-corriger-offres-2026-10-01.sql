-- Retire des stats 3 « offre_soumise » enregistrées sans envoi réel (constaté le 1er octobre 2026 : aucun mail reçu, offres contestées par l'agent).
-- Ne touche QUE ces 3 lignes (identifiées une à une). À exécuter après validation, dans le SQL Editor Supabase.
-- Étape 1 : vérifier (doit afficher exactement 3 lignes : Sellami 30/09 20:27, Mounien 30/09 16:36, Azmutally 28/09 14:35).
select id, client_nom, evenement, created_at, fiche_path from public.fiche_views
 where evenement = 'offre_soumise'
   and id in ('f75f9ced-05d4-41fd-ac17-ab0aa874cd15', 'e0c8226b-60a3-4940-9e48-1692434aa584', '8c737ca9-a4d4-4c71-859f-4ae535189076');
-- Étape 2 : supprimer ces 3 lignes (à lancer seulement si l'étape 1 affiche bien 3 lignes).
delete from public.fiche_views
 where evenement = 'offre_soumise'
   and id in ('f75f9ced-05d4-41fd-ac17-ab0aa874cd15', 'e0c8226b-60a3-4940-9e48-1692434aa584', '8c737ca9-a4d4-4c71-859f-4ae535189076');
