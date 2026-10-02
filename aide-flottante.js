/* Aide flottante Privency : FAQ (recherche par mots-clés, sans IA) + boîte à idées. Bas à droite. */
(function () {
  if (window.__aideFlottante) return; window.__aideFlottante = true;
  var FAQ = [
    ['Comment créer mon profil agent ?', 'Onglet « Profil agent » : renseignez votre nom, agence, coordonnées et photo. Vous pouvez aussi utiliser la recherche SIRET pour pré-remplir votre société. Vous ne le faites qu\'une fois.', 'profil agent creer inscription siret coordonnees photo'],
    ['Comment créer une fiche ?', 'Deux façons : importer une annonce (bouton « ⚡ Coller le texte d\'une annonce immobilière », l\'app remplit les champs pour vous) ou tout saisir à la main dans l\'onglet « Saisie du bien ». Ensuite, passez à la génération.', 'creer fiche nouvelle bien saisie manuelle import annonce'],
    ['Comment importer une annonce ?', 'Copiez le texte de votre annonce (SeLoger, Leboncoin, votre site…), collez-le dans la zone « ⚡ Coller le texte d\'une annonce immobilière » puis validez. Relisez les champs remplis avant de continuer.', 'importer annonce coller texte seloger leboncoin'],
    ['Comment générer la fiche ?', 'Une fois la saisie terminée, ouvrez l\'étape « Génération » et lancez la génération. La fiche interactive est créée en quelques instants ; vous pouvez la prévisualiser avant de la publier.', 'generer generation fiche apercu previsualiser'],
    ['Comment publier et partager une fiche à un client ?', 'Étape « Publication » : publiez la fiche, puis cliquez sur « 📤 Partager », saisissez le prénom et le nom du client et envoyez-lui le lien. Chaque client a son propre espace, vous savez ainsi qui consulte quoi.', 'publier publication partager lien client envoyer acheteur'],
    ['Combien d\'espaces acheteurs puis-je créer ?', 'Autant que vous voulez : les espaces acheteurs sont illimités, sans supplément.', 'espaces acheteurs illimites limite nombre combien'],
    ['Comment modifier ou supprimer une fiche ?', 'Dans l\'onglet des biens (liste de vos fiches publiées), utilisez les boutons « Modifier » ou « 🗑️ Supprimer » de la fiche concernée.', 'modifier supprimer effacer fiche bien'],
    ['Dans quelles langues sont les fiches ?', 'Les fiches existent en français, English, Português et Español. Votre client choisit la langue depuis la fiche.', 'langue langues anglais portugais espagnol traduction english'],
    ['Que contient une fiche ?', 'Le bien, le marché, la rentabilité, l\'historique, les diagnostics, le budget, le quartier, les documents, un assistant pour répondre aux questions de l\'acheteur et la possibilité de faire une offre.', 'contenu fiche onglets bien marche rentabilite diagnostics budget quartier documents assistant offre'],
    ['Comment savoir si mon client a ouvert la fiche ?', 'Onglet « Mes stats » : vous voyez les ouvertures, les onglets consultés, les simulations de crédit, les offres, les demandes de documents et les retours de visite, client par client.', 'stats suivi ouverture client consulte vu statistiques'],
    ['Qu\'est-ce qu\'un client « très chaud » ?', 'C\'est un acheteur qui revient souvent sur la fiche et consulte les onglets clés (budget, rentabilité, offre). Vous recevez une alerte pour le relancer au bon moment.', 'tres chaud client chaud alerte relancer'],
    ['Quelles alertes vais-je recevoir par e-mail ?', 'Quatre alertes : une offre, un client très chaud, une demande de documents, un retour de visite. Hors offres, 3 alertes maximum par jour pour ne pas vous submerger.', 'alertes notifications email mail offre documents retour visite'],
    ['Comment désactiver les alertes ?', 'Dans l\'onglet « Mes stats », vous pouvez désactiver les alertes e-mail et le résumé du lundi.', 'desactiver alertes notifications resume lundi arreter mail'],
    ['Qu\'est-ce que le compte rendu vendeur ?', 'Un lien privé à envoyer à votre vendeur (bouton « 🏠 Vendeur ») pour lui montrer l\'activité sur son bien : visites, intérêt, acquéreurs anonymisés par lettre. Vous pouvez révoquer le lien à tout moment.', 'compte rendu vendeur proprietaire bilan commercialisation lien prive'],
    ['Les acquéreurs sont-ils identifiables par le vendeur ?', 'Non. Dans le compte rendu vendeur, les acquéreurs sont anonymisés (Acquéreur A, B, C…). Leurs noms ne sont jamais montrés.', 'anonyme anonymise acquereur vendeur confidentialite rgpd nom'],
    ['Qu\'est-ce que le point du lundi ?', 'Un e-mail hebdomadaire envoyé au vendeur avec le bilan de la semaine, avec son consentement. Il peut se désinscrire à tout moment.', 'point lundi hebdomadaire email vendeur resume semaine'],
    ['Qu\'est-ce que le Coaching Express ?', 'Un outil pour préparer vos rendez-vous : « Avant mon RDV » (11 étapes vendeur, 9 acquéreur), « Une objection » (19 objections avec réponses) et « Idées ».', 'coaching express rdv rendez-vous objection preparer idees'],
    ['Comment répondre à une objection client ?', 'Coaching Express → « Une objection » : choisissez l\'objection (prix trop élevé, frais d\'agence, je réfléchis…) et lisez la réponse conseillée.', 'objection repondre prix honoraires reflechir coaching'],
    ['Où voir les vidéos tuto ?', 'Onglet « Vidéos tuto » : quatre vidéos courtes expliquent comment utiliser Privency. Vous pouvez aussi cliquer sur « Revoir le tutoriel » en haut à droite.', 'video videos tuto tutoriel aide apprendre revoir'],
    ['Combien coûte Privency ?', '69 € par mois, avec 14 jours d\'essai gratuit. TVA non applicable, art. 293 B du CGI.', 'prix tarif cout combien abonnement 69 tva'],
    ['Comment fonctionne l\'essai gratuit ?', 'Vous avez 14 jours gratuits. Votre carte est enregistrée mais n\'est pas débitée pendant l\'essai. Vous pouvez arrêter avant la fin sans rien payer.', 'essai gratuit 14 jours carte debit test'],
    ['Comment résilier mon abonnement ?', 'En haut de la page : « Mon abonnement » → « Gérer mon abonnement » (en haut de la page). Vous pouvez résilier et reprendre à tout moment, sans engagement.', 'resilier annuler abonnement arreter reprendre stripe'],
    ['Comment changer ma carte bancaire ou voir mes factures ?', 'Même chemin : « Mon abonnement » → « Gérer mon abonnement » (portail sécurisé Stripe). Vous y changez de carte et téléchargez vos factures.', 'carte bancaire facture factures changer paiement stripe'],
    ['Mes données et celles de mes clients sont-elles protégées ?', 'Oui. Chaque agent ne voit que ses propres données, et les clients ne voient que leur espace. Les liens vendeur sont privés et révocables.', 'donnees securite rgpd confidentialite protection prive'],
    ['Je n\'arrive pas à me connecter', 'Vérifiez que vous utilisez le même compte Google que d\'habitude (bouton « Changer de compte » en haut à droite si besoin). Sinon, écrivez-nous : contact@privency.fr.', 'connexion connecter login mot de passe google compte probleme'],
    ['Comment me déconnecter ?', 'Bouton « Déconnexion » en haut à droite de la page.', 'deconnexion deconnecter logout quitter'],
    ['Plusieurs agents de mon agence peuvent-ils utiliser Privency ?', 'Oui, chaque agent a son propre profil et ses propres fiches. Pour un accès agence (vue directeur), contactez-nous : contact@privency.fr.', 'agence plusieurs agents equipe directeur manager collaborateurs'],
    ['La fiche ne s\'affiche pas ou semble ancienne', 'Rechargez la page (Ctrl+F5 ou tirez pour actualiser sur mobile). Si le problème persiste, envoyez-nous le lien de la fiche à contact@privency.fr.', 'fiche bug affiche ancienne recharger probleme erreur'],
    ['Comment vous contacter ?', 'Par e-mail : contact@privency.fr. Vous pouvez aussi nous laisser une idée ou signaler un souci avec le bouton 💡 en bas à droite.', 'contact support aide email joindre']
  ];
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' '); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function search(q) {
    var words = norm(q).split(/\s+/).filter(function (w) { return w.length > 2; });
    if (!words.length) return [];
    var res = [];
    FAQ.forEach(function (f) {
      var hay = norm(f[0] + ' ' + f[2]), body = norm(f[1]), sc = 0;
      words.forEach(function (w) { if (hay.indexOf(w) >= 0) sc += 3; else if (body.indexOf(w) >= 0) sc += 1; });
      if (sc > 0) res.push([sc, f]);
    });
    res.sort(function (a, b) { return b[0] - a[0]; });
    return res.slice(0, 4).map(function (r) { return r[1]; });
  }
  async function envoyer(table, row) {
    var c = window.privencyAuth;
    if (!c) return false;
    try {
      row.id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
      if (!row.id) delete row.id;
      var r = await c.from(table).insert(row);
      if (r.error) return false;
      if (row.id) { // e-mail immédiat à l'équipe (best-effort, ne bloque jamais l'agent)
        try {
          var s = await c.auth.getSession(), t = s && s.data && s.data.session && s.data.session.access_token;
          if (t) fetch('/api/aide-notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ kind: table === 'aide_questions' ? 'question' : 'idee', id: row.id }) }).catch(function () {});
        } catch (e) {}
      }
      return true;
    } catch (e) { return false; }
  }
  var css = '#aide-fab{position:fixed;right:18px;bottom:18px;z-index:9000;display:flex;flex-direction:column;gap:10px;align-items:flex-end}' +
    '.aide-btn{width:50px;height:50px;border-radius:50%;border:0;cursor:pointer;color:#fff;background:#0E9F6E;box-shadow:0 6px 18px rgba(10,111,77,.35);font-size:22px;display:flex;align-items:center;justify-content:center}' +
    '.aide-btn.idee{background:#fff;color:#0A6F4D;border:1.5px solid #0E9F6E;width:44px;height:44px;font-size:19px}' +
    '.aide-pill{width:auto;height:46px;border-radius:23px;padding:0 16px;gap:7px;font:inherit;font-weight:700;font-size:14px}.aide-btn.idee.aide-pill{width:auto;height:40px;padding:0 14px;font-size:13px}.aide-btn:hover{transform:translateY(-2px)}' +
    '.aide-panel{position:fixed;right:18px;bottom:150px;width:340px;max-width:calc(100vw - 24px);max-height:calc(100vh - 170px);background:#fff;border:1px solid #E5E9EF;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.18);z-index:9001;display:none;flex-direction:column;overflow:hidden;font-family:inherit}' +
    '.aide-panel.open{display:flex}' +
    '.aide-head{background:#0A6F4D;color:#fff;padding:12px 14px;font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center}' +
    '.aide-head button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer}' +
    '.aide-body{padding:12px 14px;overflow:auto;font-size:13px;color:#0F1A16}' +
    '.aide-body input,.aide-body textarea,.aide-body select{width:100%;box-sizing:border-box;border:1px solid #E5E9EF;border-radius:8px;padding:8px;font:inherit;margin-bottom:8px}' +
    '.aide-body textarea{min-height:90px;resize:vertical}' +
    '.aide-q{border:1px solid #E5E9EF;border-radius:8px;margin-bottom:6px;overflow:hidden}' +
    '.aide-q>button{width:100%;text-align:left;background:#F5FAF7;border:0;padding:8px 10px;font:inherit;font-weight:600;cursor:pointer;color:#0A6F4D}' +
    '.aide-q>div{display:none;padding:8px 10px;line-height:1.45}.aide-q.open>div{display:block}' +
    '.aide-go{background:#0E9F6E;color:#fff;border:0;border-radius:8px;padding:9px 12px;font:inherit;font-weight:700;cursor:pointer;width:100%}' +
    '.aide-msg{font-size:12px;color:#667085;margin:6px 0}' +
    '@media(max-width:700px){#aide-fab{right:12px;bottom:12px}.aide-panel{right:12px;bottom:140px}}';
  function init() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var fab = document.createElement('div'); fab.id = 'aide-fab';
    fab.innerHTML = '<button type="button" class="aide-btn idee aide-pill" id="idee-btn" title="Une idée ? Un problème ?" aria-label="Boîte à idées"><span style="font-size:17px">💡</span><span>Idées</span></button><button type="button" class="aide-btn aide-pill" id="aide-btn" title="Une question ? Cliquez ici" aria-label="Aide : poser une question"><span style="font-size:19px">💬</span><span>Aide</span></button>';
    document.body.appendChild(fab);
    var pA = document.createElement('div'); pA.className = 'aide-panel'; pA.id = 'aide-panel';
    pA.innerHTML = '<div class="aide-head"><span>Aide Privency</span><button type="button" data-close aria-label="Fermer">×</button></div><div class="aide-body"><input id="aide-q" type="search" placeholder="Posez votre question…" autocomplete="off"><div id="aide-res"></div><div id="aide-more" style="display:none"><div class="aide-msg" id="aide-nores"></div><button type="button" class="aide-go" id="aide-send">Envoyer ma question à l\'équipe</button><div class="aide-msg" id="aide-sent"></div></div></div>';
    var pI = document.createElement('div'); pI.className = 'aide-panel'; pI.id = 'idee-panel';
    pI.innerHTML = '<div class="aide-head"><span>💡 Boîte à idées</span><button type="button" data-close aria-label="Fermer">×</button></div><div class="aide-body"><select id="idee-cat"><option value="idee">💡 Une idée</option><option value="bug">🐞 Un problème</option><option value="remarque">💬 Une remarque</option></select><textarea id="idee-txt" placeholder="Dites-nous tout…"></textarea><button type="button" class="aide-go" id="idee-send">Envoyer</button><div class="aide-msg" id="idee-msg"></div></div>';
    document.body.appendChild(pA); document.body.appendChild(pI);
    function toggle(p, other) { other.classList.remove('open'); p.classList.toggle('open'); }
    document.getElementById('aide-btn').onclick = function () { toggle(pA, pI); renderRes(''); };
    document.getElementById('idee-btn').onclick = function () { toggle(pI, pA); };
    [pA, pI].forEach(function (p) { p.querySelector('[data-close]').onclick = function () { p.classList.remove('open'); }; });
    var res = document.getElementById('aide-res'), more = document.getElementById('aide-more'), qi = document.getElementById('aide-q');
    function item(f) { return '<div class="aide-q"><button type="button">' + esc(f[0]) + '</button><div>' + esc(f[1]) + '</div></div>'; }
    function renderRes(q) {
      document.getElementById('aide-sent').textContent = '';
      if (!q.trim()) { res.innerHTML = '<div class="aide-msg">Questions fréquentes :</div>' + FAQ.slice(0, 8).map(item).join(''); more.style.display = 'none'; return; }
      var r = search(q);
      res.innerHTML = r.map(item).join('');
      more.style.display = 'block';
      document.getElementById('aide-nores').textContent = r.length ? 'Ce n\'est pas ce que vous cherchiez ?' : 'Je n\'ai pas de réponse à cette question.';
    }
    qi.oninput = function () { renderRes(qi.value); };
    res.onclick = function (e) { var b = e.target.closest('.aide-q>button'); if (b) b.parentNode.classList.toggle('open'); };
    document.getElementById('aide-send').onclick = async function () {
      var ok = await envoyer('aide_questions', { question: qi.value.trim().slice(0, 1000) });
      document.getElementById('aide-sent').textContent = ok ? 'Merci, votre question a bien été transmise.' : 'Envoi impossible pour le moment. Écrivez-nous à contact@privency.fr.';
    };
    document.getElementById('idee-send').onclick = async function () {
      var t = document.getElementById('idee-txt'), m = document.getElementById('idee-msg');
      if (t.value.trim().length < 3) { m.textContent = 'Écrivez quelques mots avant d\'envoyer.'; return; }
      var ok = await envoyer('agent_idees', { categorie: document.getElementById('idee-cat').value, message: t.value.trim().slice(0, 3000) });
      m.textContent = ok ? 'Merci ! Votre message a bien été reçu.' : 'Envoi impossible pour le moment. Écrivez-nous à contact@privency.fr.';
      if (ok) t.value = '';
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.__aideFaqSearch = search;
})();
