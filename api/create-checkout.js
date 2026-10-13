const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';

module.exports = async function handler(req, res) {
  // CORS — autorise les appels depuis n'importe quelle origine
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id, email } = req.body || {};
  // Code d'essai facultatif : normalisé en majuscules, sans espaces (les codes sont stockés ainsi).
  const rawCode = req.body && typeof req.body.code === 'string' ? req.body.code : '';
  const code = rawCode.replace(/\s+/g, '').toUpperCase();

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

    // ── Essai gratuit 30 jours sans carte, activé par un code à usage unique ──
    let codeReserve = false;
    if (code) {
      // Le code est lié à un compte : l'appelant doit prouver qu'il est bien user_id.
      const authHeader = req.headers.authorization || '';
      const jwt = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7).trim() : '';
      if (!jwt) {
        return res.status(401).json({ error: 'Reconnectez-vous pour utiliser un code d\'essai.' });
      }
      const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
      if (userErr || !userData || !userData.user || userData.user.id !== user_id) {
        return res.status(401).json({ error: 'Session invalide ou expirée. Reconnectez-vous puis réessayez.' });
      }

      // Un seul essai par agent : déjà client Stripe, ou déjà un code consommé.
      if (existingCustomerId) {
        return res.status(400).json({ error: 'Le code d\'essai est réservé aux nouveaux comptes : vous avez déjà eu un abonnement.' });
      }
      const { data: dejaUtilise, error: dejaErr } = await supabaseAdmin
        .from('codes_essai')
        .select('code')
        .eq('utilise_par', user_id)
        .limit(1);
      if (dejaErr) {
        console.error('[api/create-checkout] lookup codes_essai (déjà utilisé):', dejaErr);
        return res.status(500).json({ error: 'Impossible de vérifier le code pour le moment. Réessayez.' });
      }
      if (dejaUtilise && dejaUtilise.length) {
        return res.status(400).json({ error: 'Vous avez déjà utilisé un code d\'essai : un seul essai par compte.' });
      }

      // Réservation atomique : l'UPDATE ne touche que la ligne encore libre, donc deux
      // requêtes simultanées ne peuvent pas obtenir le même code.
      const { data: reserve, error: claimErr } = await supabaseAdmin
        .from('codes_essai')
        .update({ utilise_par: user_id, utilise_le: new Date().toISOString().slice(0, 10) })
        .eq('code', code)
        .is('utilise_par', null)
        .select('code');
      if (claimErr) {
        if (claimErr.code === '23505') {
          return res.status(400).json({ error: 'Vous avez déjà utilisé un code d\'essai : un seul essai par compte.' });
        }
        console.error('[api/create-checkout] réservation code:', claimErr);
        return res.status(500).json({ error: 'Impossible de vérifier le code pour le moment. Réessayez.' });
      }
      if (!reserve || !reserve.length) {
        const { data: existe } = await supabaseAdmin.from('codes_essai').select('code').eq('code', code).maybeSingle();
        return res.status(400).json({
          error: existe ? 'Ce code d\'essai a déjà été utilisé.' : 'Code d\'essai invalide. Vérifiez la saisie.'
        });
      }
      codeReserve = true;
    }

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

    if (codeReserve) {
      params.payment_method_collection = 'if_required';
      params.customer_email = email;
      params.subscription_data = {
        trial_period_days: 30,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } }
      };
      params.custom_text = {
        submit: {
          message: "30 jours offerts, sans carte bancaire. Sans abonnement à la fin de l'essai, votre compte passe en lecture seule : vos fiches sont conservées."
        }
      };
    } else if (existingCustomerId) {
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

    let session;
    try {
      session = await stripe.checkout.sessions.create(params);
    } catch (stripeErr) {
      // La session n'a pas été créée : on libère le code pour qu'il reste utilisable.
      if (codeReserve) {
        const { error: releaseErr } = await supabaseAdmin
          .from('codes_essai')
          .update({ utilise_par: null, utilise_le: null })
          .eq('code', code)
          .eq('utilise_par', user_id);
        if (releaseErr) console.error('[api/create-checkout] libération du code échouée:', code, releaseErr);
      }
      throw stripeErr;
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[api/create-checkout] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
