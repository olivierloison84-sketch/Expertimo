const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: 'price_1TgrG0LwU7EqTQT5nH642tHZ',
          quantity: 1
        }
      ],
      success_url: 'https://expertimo-phi.vercel.app/app.html',
      cancel_url: 'https://expertimo-phi.vercel.app/login.html',
      customer_email: email,
      client_reference_id: user_id
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[api/create-checkout] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
