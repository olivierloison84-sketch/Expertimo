-- Guide « Vivre à [ville] » : supprime les guides de Longjumeau, Chilly-Mazarin et Wissous pour qu'ils soient régénérés
-- au prochain usage avec les règles actuelles (distances en km autorisées si sourcées, parcs DATAtourisme, chaque phrase
-- adossée à son passage dans l'extrait, formulations d'acheteur, écoles).
-- À EXÉCUTER manuellement dans l'éditeur SQL Supabase, APRÈS le déploiement de la nouvelle version de api/guide-commune.js.
-- Ne touche ni aux fiches déjà publiées ni aux modifications des agents (elles restent dans chaque fiche).
delete from public.guide_commune where insee in ('91345', '91161', '91689');   -- Longjumeau, Chilly-Mazarin, Wissous
