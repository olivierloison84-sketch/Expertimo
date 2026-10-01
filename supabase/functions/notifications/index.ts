// Edge Function « notifications » : alertes agent (toutes les 10 min) et point hebdomadaire vendeur (lundi).
// Programmée par pg_cron (voir supabase-notifications.sql). Secrets : RESEND_API_KEY (déjà utilisé par relances-comportementales).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement. Déploiement :
//   supabase functions deploy notifications
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handle } from './handler.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
Deno.serve((req: Request) => handle(req, { env: { RESEND_API_KEY: Deno.env.get('RESEND_API_KEY'), SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }, db, fetch }));
