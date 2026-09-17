const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';

module.exports = async function handler(req, res) {
  // CORS — autorise les appels depuis n'importe quelle origine
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id } = req.body || {};

  if (!user_id) {
    return res.status(400).json({ error: 'user_id required' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured on server' });
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SECRET_KEY not configured on server' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  try {
    const { data, error } = await supabaseAdmin
      .from('agents')
      .select('stripe_customer_id')
      .eq('id', user_id)
      .maybeSingle();

    if (error) {
      console.error('[api/create-portal-session] lookup agents:', error);
      return res.status(500).json({ error: 'Erreur lors de la récupération du compte' });
    }

    if (!data || !data.stripe_customer_id) {
      return res.status(400).json({ error: 'Aucun abonnement associé à ce compte.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: 'https://app.privency.fr/dashboard.html'
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[api/create-portal-session] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
