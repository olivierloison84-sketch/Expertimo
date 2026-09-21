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

  const { user_id, email } = req.body || {};

  if (!user_id || !email) {
    return res.status(400).json({ error: 'user_id and email required' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured on server' });
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SECRET_KEY not configured on server' });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  try {
    // L'essai gratuit n'est offert qu'à la première souscription : un agent qui a déjà
    // un stripe_customer_id a déjà été abonné, on réutilise son customer sans essai.
    const { data: agent, error: lookupError } = await supabaseAdmin
      .from('agents')
      .select('stripe_customer_id')
      .eq('id', user_id)
      .maybeSingle();

    if (lookupError) {
      console.error('[api/create-checkout] lookup agents:', lookupError);
      return res.status(500).json({ error: 'Erreur lors de la récupération du compte' });
    }

    const existingCustomerId = agent && agent.stripe_customer_id;

    const params = {
      mode: 'subscription',
      line_items: [
        {
          price: 'price_1UGLoSLkk3vvHRV1Vo5eFzv9',
          quantity: 1
        }
      ],
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      payment_method_collection: 'always',
      success_url: 'https://app.privency.fr/app.html',
      cancel_url: 'https://app.privency.fr/login.html',
      client_reference_id: user_id
    };

    if (existingCustomerId) {
      params.customer = existingCustomerId;
      // Requis par automatic_tax quand un customer existant est réutilisé
      params.customer_update = { address: 'auto' };
    } else {
      params.customer_email = email;
      params.subscription_data = {
        trial_period_days: 14,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } }
      };
      params.custom_text = {
        submit: {
          message: "14 jours offerts. Votre carte ne sera débitée qu'à la fin de l'essai. Vous pouvez annuler à tout moment depuis « Gérer mon abonnement »."
        }
      };
    }

    const session = await stripe.checkout.sessions.create(params);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[api/create-checkout] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
