#!/bin/bash
set -e
cat > login.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connexion — Privency</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'DM Sans', sans-serif;
    background: #141414;
    color: #f0ede6;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .login-card {
    width: 100%;
    max-width: 420px;
  }

  .brand {
    text-align: center;
    margin-bottom: 40px;
  }

  .brand h1 {
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #f0ede6;
  }

  .brand h1 span {
    color: #b8923a;
  }

  .brand p {
    margin-top: 8px;
    font-size: 14px;
    color: #8a857c;
    font-weight: 300;
  }

  .form-box {
    background: #1c1c1c;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    padding: 36px 32px;
  }

  .form-box h2 {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 28px;
    text-align: center;
  }

  .field {
    margin-bottom: 20px;
  }

  .field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #b3aea4;
    margin-bottom: 8px;
    letter-spacing: 0.3px;
  }

  .field input {
    width: 100%;
    padding: 13px 14px;
    background: #141414;
    border: 1px solid #333;
    border-radius: 8px;
    color: #f0ede6;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    transition: border-color 0.2s ease;
  }

  .field input:focus {
    outline: none;
    border-color: #b8923a;
  }

  .field input::placeholder {
    color: #5c574e;
  }

  .btn-submit {
    width: 100%;
    padding: 14px;
    margin-top: 8px;
    background: #b8923a;
    color: #141414;
    border: none;
    border-radius: 8px;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: background 0.2s ease, opacity 0.2s ease;
  }

  .btn-submit:hover {
    background: #c9a14a;
  }

  .btn-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    display: none;
    margin-top: 16px;
    padding: 12px 14px;
    background: rgba(192, 57, 43, 0.12);
    border: 1px solid rgba(192, 57, 43, 0.4);
    border-radius: 8px;
    color: #e07b6e;
    font-size: 14px;
    line-height: 1.4;
  }

  .error-message.visible {
    display: block;
  }

  .register-link {
    margin-top: 24px;
    text-align: center;
    font-size: 14px;
    color: #8a857c;
  }

  .register-link a {
    color: #b8923a;
    text-decoration: none;
    font-weight: 500;
  }

  .register-link a:hover {
    text-decoration: underline;
  }

  .forgot-link {
    text-align: right;
    margin-top: -12px;
    margin-bottom: 20px;
  }

  .forgot-link a {
    font-size: 13px;
    color: #8a857c;
    text-decoration: none;
  }

  .forgot-link a:hover {
    color: #b8923a;
    text-decoration: underline;
  }

  .success-message {
    display: none;
    margin-top: 16px;
    padding: 12px 14px;
    background: rgba(184, 146, 58, 0.12);
    border: 1px solid rgba(184, 146, 58, 0.4);
    border-radius: 8px;
    color: #d4a956;
    font-size: 14px;
    line-height: 1.4;
  }

  .success-message.visible {
    display: block;
  }
</style>
</head>
<body>

<div class="login-card">
  <div class="brand">
    <h1>Priven<span>cy</span></h1>
    <p>Votre espace immobilier professionnel</p>
  </div>

  <div class="form-box">
    <h2>Connexion</h2>
    <form id="login-form" novalidate>
      <div class="field">
        <label for="email">Adresse email</label>
        <input type="email" id="email" name="email" placeholder="vous@exemple.fr" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="password">Mot de passe</label>
        <input type="password" id="password" name="password" placeholder="••••••••" autocomplete="current-password" required>
      </div>
      <p class="forgot-link"><a href="#" id="forgot-password-link">Mot de passe oublié ?</a></p>
      <button type="submit" class="btn-submit" id="submit-btn">Se connecter</button>
      <div class="error-message" id="error-message"></div>
      <div class="success-message" id="success-message"></div>
    </form>
    <p class="register-link">Pas encore de compte ? <a href="/register.html">S'inscrire</a></p>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Asv3-Q2Q9XSA_gvV1nB74Q_0N6prN2E';

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const form = document.getElementById('login-form');
  const submitBtn = document.getElementById('submit-btn');
  const errorMessage = document.getElementById('error-message');
  const successMessage = document.getElementById('success-message');
  const forgotLink = document.getElementById('forgot-password-link');

  forgotLink.addEventListener('click', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();

    errorMessage.classList.remove('visible');
    successMessage.classList.remove('visible');

    if (!email) {
      errorMessage.textContent = "Renseignez d'abord votre email ci-dessus, puis cliquez sur « Mot de passe oublié ? ».";
      errorMessage.classList.add('visible');
      return;
    }

    forgotLink.textContent = 'Envoi en cours…';

    await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });

    // Message volontairement identique que le compte existe ou non (bonne pratique de sécurité).
    successMessage.textContent = 'Si un compte existe avec cet email, un lien de réinitialisation vient de vous être envoyé.';
    successMessage.classList.add('visible');
    forgotLink.textContent = 'Mot de passe oublié ?';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    errorMessage.classList.remove('visible');
    successMessage.classList.remove('visible');

    if (!email || !password) {
      errorMessage.textContent = 'Veuillez renseigner votre email et votre mot de passe.';
      errorMessage.classList.add('visible');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Connexion…';

    const { error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      errorMessage.textContent = error.message === 'Invalid login credentials'
        ? 'Email ou mot de passe incorrect.'
        : error.message;
      errorMessage.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Se connecter';
      return;
    }

    window.location.href = '/dashboard.html';
  });
</script>

</body>
</html>
HTMLEOF

cat > reset-password.html << 'HTMLEOF2'
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nouveau mot de passe — Privency</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'DM Sans', sans-serif;
    background: #141414;
    color: #f0ede6;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .login-card { width: 100%; max-width: 420px; }
  .brand { text-align: center; margin-bottom: 40px; }
  .brand h1 { font-size: 28px; font-weight: 600; letter-spacing: 4px; text-transform: uppercase; color: #f0ede6; }
  .brand h1 span { color: #b8923a; }
  .brand p { margin-top: 8px; font-size: 14px; color: #8a857c; font-weight: 300; }
  .form-box { background: #1c1c1c; border: 1px solid #2a2a2a; border-radius: 12px; padding: 36px 32px; }
  .form-box h2 { font-size: 18px; font-weight: 500; margin-bottom: 12px; text-align: center; }
  .form-box .subtitle { font-size: 13px; color: #8a857c; text-align: center; margin-bottom: 28px; line-height: 1.5; }
  .field { margin-bottom: 20px; }
  .field label { display: block; font-size: 13px; font-weight: 500; color: #b3aea4; margin-bottom: 8px; letter-spacing: 0.3px; }
  .field input {
    width: 100%; padding: 13px 14px; background: #141414; border: 1px solid #333;
    border-radius: 8px; color: #f0ede6; font-family: 'DM Sans', sans-serif; font-size: 15px;
    transition: border-color 0.2s ease;
  }
  .field input:focus { outline: none; border-color: #b8923a; }
  .field input::placeholder { color: #5c574e; }
  .btn-submit {
    width: 100%; padding: 14px; margin-top: 8px; background: #b8923a; color: #141414;
    border: none; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 15px;
    font-weight: 600; letter-spacing: 0.5px; cursor: pointer; transition: background 0.2s ease, opacity 0.2s ease;
  }
  .btn-submit:hover { background: #c9a14a; }
  .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .error-message {
    display: none; margin-top: 16px; padding: 12px 14px; background: rgba(192, 57, 43, 0.12);
    border: 1px solid rgba(192, 57, 43, 0.4); border-radius: 8px; color: #e07b6e; font-size: 14px; line-height: 1.4;
  }
  .error-message.visible { display: block; }
  .success-message {
    display: none; margin-top: 16px; padding: 12px 14px; background: rgba(184, 146, 58, 0.12);
    border: 1px solid rgba(184, 146, 58, 0.4); border-radius: 8px; color: #d4a956; font-size: 14px; line-height: 1.4;
  }
  .success-message.visible { display: block; }
  .register-link { margin-top: 24px; text-align: center; font-size: 14px; color: #8a857c; }
  .register-link a { color: #b8923a; text-decoration: none; font-weight: 500; }
  .register-link a:hover { text-decoration: underline; }
</style>
</head>
<body>

<div class="login-card">
  <div class="brand">
    <h1>Priven<span>cy</span></h1>
    <p>Votre espace immobilier professionnel</p>
  </div>

  <div class="form-box" id="reset-box">
    <h2>Nouveau mot de passe</h2>
    <p class="subtitle" id="subtitle">Choisissez un nouveau mot de passe pour votre compte.</p>
    <form id="reset-form" novalidate>
      <div class="field">
        <label for="password">Nouveau mot de passe</label>
        <input type="password" id="password" name="password" placeholder="8 caractères minimum" autocomplete="new-password" required minlength="8">
      </div>
      <div class="field">
        <label for="password-confirm">Confirmer le mot de passe</label>
        <input type="password" id="password-confirm" name="password-confirm" placeholder="••••••••" autocomplete="new-password" required minlength="8">
      </div>
      <button type="submit" class="btn-submit" id="submit-btn">Enregistrer le nouveau mot de passe</button>
      <div class="error-message" id="error-message"></div>
      <div class="success-message" id="success-message"></div>
    </form>
    <p class="register-link"><a href="/login.html">Retour à la connexion</a></p>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Asv3-Q2Q9XSA_gvV1nB74Q_0N6prN2E';

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const form = document.getElementById('reset-form');
  const submitBtn = document.getElementById('submit-btn');
  const errorMessage = document.getElementById('error-message');
  const successMessage = document.getElementById('success-message');
  const subtitle = document.getElementById('subtitle');

  let recoveryReady = false;

  // Le lien reçu par email contient un jeton de récupération que le SDK Supabase
  // échange automatiquement contre une session temporaire à l'ouverture de la page.
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryReady = true;
    }
  });

  // Filet de sécurité : si l'événement PASSWORD_RECOVERY n'a pas encore été capté
  // au moment où l'utilisateur soumet le formulaire, on vérifie la session directement.
  async function ensureRecoverySession() {
    if (recoveryReady) return true;
    const { data } = await client.auth.getSession();
    return !!data.session;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password-confirm').value;

    errorMessage.classList.remove('visible');
    successMessage.classList.remove('visible');

    if (password.length < 8) {
      errorMessage.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';
      errorMessage.classList.add('visible');
      return;
    }

    if (password !== passwordConfirm) {
      errorMessage.textContent = 'Les deux mots de passe ne correspondent pas.';
      errorMessage.classList.add('visible');
      return;
    }

    const hasSession = await ensureRecoverySession();
    if (!hasSession) {
      errorMessage.textContent = "Ce lien de réinitialisation n'est plus valide ou a expiré. Redemandez un email depuis la page de connexion.";
      errorMessage.classList.add('visible');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enregistrement…';

    const { error } = await client.auth.updateUser({ password });

    if (error) {
      errorMessage.textContent = error.message;
      errorMessage.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enregistrer le nouveau mot de passe';
      return;
    }

    submitBtn.textContent = 'Mot de passe mis à jour ✓';
    document.getElementById('password').disabled = true;
    document.getElementById('password-confirm').disabled = true;
    subtitle.textContent = '';
    successMessage.textContent = 'Mot de passe mis à jour avec succès. Redirection vers la connexion…';
    successMessage.classList.add('visible');

    await client.auth.signOut();
    setTimeout(() => { window.location.href = '/login.html'; }, 2200);
  });
</script>

</body>
</html>
HTMLEOF2

git add login.html reset-password.html
git commit -m "feat: ajout du mot de passe oublié (lien reset via Supabase Auth)"

echo "=== login.html et reset-password.html créés/modifiés et commités. Reste à pousser sur main. ==="
