-- ═══════════════════════════════════════════════════════════════════════
-- Policy DELETE sur fiche_views — suppression des statistiques par l'agent
-- propriétaire
--
-- À exécuter manuellement dans le SQL Editor du projet Supabase
-- « Privency-saas » (https://supabase.com/dashboard) AVANT que les
-- suppressions déclenchées depuis "Mes stats" (app.html) ne puissent
-- fonctionner.
--
-- Reprend exactement la même logique de portée que la policy SELECT
-- existante "Agent voit uniquement ses propres statistiques" : un agent
-- authentifié ne peut agir que sur les lignes dont fiche_path correspond
-- à une de ses fiches, via la table agent_fiches (agent_user_id = auth.uid()).
--
-- Ne touche ni aux policies SELECT et INSERT existantes, ni à la
-- structure de la table fiche_views.
-- ═══════════════════════════════════════════════════════════════════════

create policy "Agent supprime uniquement ses propres statistiques"
  on public.fiche_views for delete
  to authenticated
  using (
    exists (
      select 1
      from public.agent_fiches af
      where af.agent_user_id = auth.uid()
        and fiche_views.fiche_path = '/fiches/' || af.filename
    )
  );
