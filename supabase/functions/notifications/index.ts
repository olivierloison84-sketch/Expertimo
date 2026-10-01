// Edge Function « notifications » : alertes agent (toutes les 10 min) et point hebdomadaire vendeur (lundi).
// Programmée par pg_cron (voir supabase-notifications.sql). Secrets : RESEND_API_KEY (déjà utilisé par relances-comportementales).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement. Déploiement :
//   supabase functions deploy notifications
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handle } from './handler.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
// Vérifie un jeton en appelant notif_ping() avec lui : seul le rôle service_role y a droit.
const verify = async (token: string) => {
  const c = createClient(Deno.env.get('SUPABASE_URL')!, token, { auth: { persistSession: false } });
  const { data, error } = await c.rpc('notif_ping');
  return !error && data === true;
};
Deno.serve((req: Request) => handle(req, { verify, env: { RESEND_API_KEY: Deno.env.get('RESEND_API_KEY'), SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }, db, fetch }));
