const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Client service role : bypasse la RLS pour écrire dans la table agents.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// La vérification de signature Stripe exige le body brut, non parsé.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Crée l'entrée agent_profiles (prénom, email, écran de bienvenue non vu)
// et envoie l'email de bienvenue — uniquement pour un tout nouveau membre :
// un checkout.session.completed peut aussi correspondre à un réabonnement,
// auquel cas le membre existe déjà et ne doit ni revoir l'écran de
// bienvenue, ni recevoir un second email de bienvenue.
async function creerMembreEtEnvoyerBienvenue(userId, email) {
  if (!userId) return;
  try {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('agent_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (lookupError) {
      console.error('[api/stripe-webhook] échec vérification agent_profiles existant:', lookupError);
      return;
    }
    if (existing) return;

    let prenom = '';
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      prenom = (userData && userData.user && userData.user.user_metadata && userData.user.user_metadata.prenom) || '';
    } catch (e) {
      console.error('[api/stripe-webhook] échec lecture user_metadata:', e);
    }

    const { error: insertError } = await supabaseAdmin
      .from('agent_profiles')
      .insert({ user_id: userId, prenom: prenom || null, email: email || null, a_vu_ecran_accueil: false });
    if (insertError) {
      console.error('[api/stripe-webhook] échec création agent_profiles:', insertError);
      return;
    }

    await envoyerEmailBienvenue(prenom, email);
  } catch (e) {
    console.error('[api/stripe-webhook] creerMembreEtEnvoyerBienvenue:', e);
  }
}

// Envoi best-effort via Resend (même service que api/send-lead.js). N'échoue
// jamais le webhook : Stripe interprète un 5xx comme un échec et le rejoue.
async function envoyerEmailBienvenue(prenom, email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !email) return;

  const lienConnexion = 'https://app.privency.fr/login.html';
  const salutation = prenom ? 'Bienvenue ' + prenom + ' !' : 'Bienvenue !';

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        from: 'Privency <bonjour@privency.fr>',
        to: [email],
        subject: 'Bienvenue sur Privency',
        html: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">'
          + '<h2 style="margin:0 0 12px;">' + salutation + '</h2>'
          + '<p>Votre espace Privency est prêt. Connectez-vous pour créer votre première fiche acheteur.</p>'
          + '<p style="margin:20px 0;"><a href="' + lienConnexion + '" '
          + 'style="background:#b8923a;color:#141414;padding:12px 20px;border-radius:6px;'
          + 'text-decoration:none;font-weight:600;">Accéder à mon espace</a></p>'
          + '</div>'
      })
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json().catch(function() { return {}; });
      console.error('[api/stripe-webhook] Resend error:', resendRes.status, errData);
    }
  } catch (e) {
    console.error('[api/stripe-webhook] envoyerEmailBienvenue:', e);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[api/stripe-webhook] Signature invalide:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const email = session.customer_email || (session.customer_details && session.customer_details.email);
        const { error } = await supabaseAdmin
          .from('agents')
          .upsert({
            id: userId,
            email: email,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            subscription_status: 'active'
          });
        if (error) throw error;
        await creerMembreEtEnvoyerBienvenue(userId, email);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const { error } = await supabaseAdmin
          .from('agents')
          .update({ subscription_status: 'inactive' })
          .eq('stripe_subscription_id', subscription.id);
        if (error) throw error;
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const { error } = await supabaseAdmin
          .from('agents')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', invoice.customer);
        if (error) throw error;
        break;
      }

      default:
        // Événement non géré : on accuse réception sans agir.
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[api/stripe-webhook] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports.config = { api: { bodyParser: false } };
