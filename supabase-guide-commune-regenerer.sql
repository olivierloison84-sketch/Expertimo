-- Guide « Vivre à [ville] » : supprime les guides générés avant les règles de fidélité (PR « guide fidèle aux sources »)
-- pour qu'ils soient régénérés au prochain usage. À EXÉCUTER manuellement dans l'éditeur SQL Supabase,
-- APRÈS le déploiement de la nouvelle version de api/guide-commune.js.
delete from public.guide_commune where insee in ('91345', '91161', '91689');   -- Longjumeau, Chilly-Mazarin, Wissous
