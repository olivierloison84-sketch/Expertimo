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
        const { error } = await supabaseAdmin
          .from('agents')
          .upsert({
            id: session.client_reference_id,
            email: session.customer_email || (session.customer_details && session.customer_details.email),
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            subscription_status: 'active'
          });
        if (error) throw error;
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
