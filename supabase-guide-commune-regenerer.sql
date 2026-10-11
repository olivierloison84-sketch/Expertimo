-- Guide « Vivre à [ville] » : supprime les guides de Longjumeau, Chilly-Mazarin et Wissous pour qu'ils soient régénérés
-- au prochain usage avec les règles actuelles (rubriques courtes, interdits, extrait source enregistré par rubrique).
-- À EXÉCUTER manuellement dans l'éditeur SQL Supabase, APRÈS le déploiement de la nouvelle version de api/guide-commune.js.
-- Ne touche ni aux fiches déjà publiées ni aux modifications des agents (elles restent dans chaque fiche).
delete from public.guide_commune where insee in ('91345', '91161', '91689');   -- Longjumeau, Chilly-Mazarin, Wissous
