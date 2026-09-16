-- ═══════════════════════════════════════════════════════════════════════
-- Suivi comportemental — programmation de l'Edge Function via pg_cron
--
-- À exécuter manuellement dans le SQL Editor du projet Supabase
-- « Privency-saas » (https://supabase.com/dashboard), APRÈS avoir :
--   1. Déployé la fonction :
--        supabase functions deploy relances-comportementales
--   2. Configuré son secret Resend :
--        supabase secrets set RESEND_API_KEY=<votre clé Resend>
--      (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont déjà injectées
--      automatiquement dans l'environnement de toute Edge Function.)
--   3. Créé UNE FOIS le secret Vault utilisé ci-dessous pour authentifier
--      l'appel pg_cron → Edge Function (remplacez par votre vraie clé
--      service_role, visible dans Project Settings → API) :
--        select vault.create_secret('<votre clé service_role>', 'service_role_key');
--
-- Remplace la relance J+3/J+7/inactivité/mensuelle qui tournait auparavant
-- sur un Vercel Cron Job (api/cron/relances-comportementales.js, retiré du
-- dépôt) : le plan Vercel Hobby limite un déploiement à 12 fonctions
-- serverless, déjà atteintes sans elle. Le reste de l'app (webhook Stripe,
-- api/fiche-publish.js, api/send-lead.js, etc.) continue de tourner sur
-- Vercel ; seule cette tâche planifiée est passée côté Supabase.
--
-- Le rôle service_role n'est jamais exposé côté client (contrairement à la
-- clé anon utilisée par app.html) : c'est ce qui empêche un tiers de
-- déclencher ces relances depuis l'extérieur — voir la vérification
-- correspondante dans supabase/functions/relances-comportementales/index.ts.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'relances-comportementales-quotidien',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://hhqcumnatnslfjpsrmgb.supabase.co/functions/v1/relances-comportementales',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Pour désactiver : select cron.unschedule('relances-comportementales-quotidien');
-- Pour vérifier l'historique d'exécution : select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'relances-comportementales-quotidien')
--   order by start_time desc limit 20;
