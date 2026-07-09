#!/bin/bash
set -e
cat > mentions-legales.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mentions légales — Privency</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#f4f1ea;--card:#fff;--ink:#111;--gold:#b8923a;--gold2:#d4a956;--cream:#ede9df;--muted:#888880;--border:#ddd8cc;--dark:#141414;}
  *{box-sizing:border-box;}
  body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--ink);margin:0;line-height:1.7;}
  .topbar{background:var(--dark);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;}
  .topbar a{font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--gold);text-decoration:none;font-weight:400;letter-spacing:.03em;}
  .topbar span{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6a5a3a;}
  .wrap{max-width:760px;margin:0 auto;padding:56px 24px 80px;}
  h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:clamp(30px,5vw,44px);color:var(--dark);margin:0 0 8px;}
  .updated{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:40px;display:block;}
  h2{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:24px;color:var(--dark);margin:40px 0 14px;padding-top:20px;border-top:1px solid var(--border);}
  h2:first-of-type{border-top:none;padding-top:0;}
  p{font-size:15px;color:#333;margin:0 0 14px;}
  ul,ol{font-size:15px;color:#333;padding-left:22px;margin:0 0 14px;}
  li{margin-bottom:6px;}
  strong{color:var(--dark);font-weight:600;}
  em{color:var(--muted);}
  a{color:var(--gold);}
  table{width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;}
  th{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 10px;background:var(--cream);border-bottom:1px solid var(--border);}
  td{padding:8px 10px;border-bottom:1px solid var(--border);}
  hr{border:none;border-top:1px solid var(--border);margin:36px 0;}
  .note{background:var(--cream);border-left:2px solid var(--gold);padding:14px 18px;border-radius:0 8px 8px 0;font-size:13px;color:#5a5346;margin:16px 0;}
  .note em{color:#5a5346;}
  footer{text-align:center;padding:24px 20px;background:var(--dark);border-top:1px solid rgba(184,146,58,.15);}
  .flogo{font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--gold);font-weight:300;letter-spacing:.06em;margin-bottom:4px;}
  .ftag{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#6a5a3a;}
  .flinks{margin-top:10px;font-family:'DM Sans',sans-serif;font-size:11px;}
  .flinks a{color:#8a7550;text-decoration:none;margin:0 8px;}
  .flinks a:hover{color:var(--gold);}
</style>
</head>
<body>
<div class="topbar">
  <a href="/">Privency</a>
  <span>Mentions légales</span>
</div>
<div class="wrap">
<h1>Mentions légales</h1>
<h2>Éditeur du site</h2>
<p>Le site Privency (accessible notamment aux adresses expertimo-phi.vercel.app et olivierloison84-sketch.github.io/Expertimo) est édité par :</p>
<p><strong>LOISON Olivier</strong>
Entreprise Individuelle (micro-entreprise)
85 B Rue du Bois de Châtres, 91220 Brétigny-sur-Orge, France
SIRET : 501 159 404 00059
RSAC Évry (Registre Spécial des Agents Commerciaux)
N° TVA intracommunautaire : FR 49 501 159 404
Email : olivier.loison@expertimo.com
Téléphone : 06 85 68 46 13</p>
<p><strong>Directeur de la publication :</strong> Olivier Loison</p>
<h2>Hébergement</h2>
<p>Le site et l'application Privency sont hébergés par plusieurs prestataires distincts, selon les composants :</p>
<p><strong>Application principale (app.html) :</strong>
Vercel Inc.
340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis</p>
<p><strong>Fiches acheteur (pages publiées) :</strong>
GitHub, Inc. (GitHub Pages)
88 Colin P Kelly Jr St, San Francisco, CA 94107, États-Unis</p>
<p><strong>Base de données :</strong>
Supabase Inc.</p>
<p><strong>Paiements :</strong>
Stripe Payments Europe, Ltd.</p>
<p><strong>Stockage des photographies :</strong>
Cloudinary Ltd.</p>
<h2>Propriété intellectuelle</h2>
<p>L'ensemble des éléments composant le site et l'application Privency (structure, textes, logos, charte graphique, code source, base de données) est la propriété exclusive d'Olivier Loison, sauf mention contraire, et est protégé par les dispositions du Code de la propriété intellectuelle.</p>
<p>Toute reproduction, représentation, modification, publication, ou adaptation de tout ou partie des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite sans l'autorisation écrite préalable d'Olivier Loison.</p>
<p>Les fiches acheteur générées par le service restent la propriété de l'agent immobilier client qui les a créées, dans le cadre de son abonnement.</p>
<h2>Données personnelles</h2>
<p>Le traitement des données personnelles collectées via le site et l'application (agents utilisateurs et acquéreurs destinataires des fiches) est décrit dans notre Politique de confidentialité, accessible sur le site.</p>
<p>Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données. Pour exercer ces droits, contactez : olivier.loison@expertimo.com.</p>
<h2>Cookies</h2>
<p>Le site peut utiliser des cookies techniques nécessaires à son fonctionnement (authentification, session) ainsi que des cookies de mesure d'audience. En poursuivant votre navigation, vous acceptez leur utilisation conformément à notre politique en la matière.</p>
<h2>Limitation de responsabilité</h2>
<p>Olivier Loison s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées sur le site, mais ne peut garantir l'absence d'erreur ou d'omission. Les informations financières, fiscales et de marché (simulations de crédit, comparables DVF, estimations) sont fournies à titre indicatif et ne sauraient engager la responsabilité de l'éditeur ni se substituer à l'avis d'un professionnel qualifié (notaire, courtier, conseiller fiscal).</p>
<h2>Droit applicable</h2>
<p>Les présentes mentions légales sont soumises au droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux français seront seuls compétents.</p>
<hr />
<span class="updated">Dernière mise à jour : 9 juillet 2026</span>
</div>
<footer>
  <div class="flogo">Privency</div>
  <div class="ftag">Le mandat exclusif, sans compétence technique</div>
  <div class="flinks">
    <a href="/mentions-legales.html">Mentions légales</a>·
    <a href="/cgv.html">CGV</a>·
    <a href="/politique-confidentialite.html">Politique de confidentialité</a>
  </div>
</footer>
</body>
</html>
HTMLEOF

cat > cgv.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Conditions Générales de Vente — Privency</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#f4f1ea;--card:#fff;--ink:#111;--gold:#b8923a;--gold2:#d4a956;--cream:#ede9df;--muted:#888880;--border:#ddd8cc;--dark:#141414;}
  *{box-sizing:border-box;}
  body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--ink);margin:0;line-height:1.7;}
  .topbar{background:var(--dark);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;}
  .topbar a{font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--gold);text-decoration:none;font-weight:400;letter-spacing:.03em;}
  .topbar span{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6a5a3a;}
  .wrap{max-width:760px;margin:0 auto;padding:56px 24px 80px;}
  h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:clamp(30px,5vw,44px);color:var(--dark);margin:0 0 8px;}
  .updated{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:40px;display:block;}
  h2{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:24px;color:var(--dark);margin:40px 0 14px;padding-top:20px;border-top:1px solid var(--border);}
  h2:first-of-type{border-top:none;padding-top:0;}
  p{font-size:15px;color:#333;margin:0 0 14px;}
  ul,ol{font-size:15px;color:#333;padding-left:22px;margin:0 0 14px;}
  li{margin-bottom:6px;}
  strong{color:var(--dark);font-weight:600;}
  em{color:var(--muted);}
  a{color:var(--gold);}
  table{width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;}
  th{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 10px;background:var(--cream);border-bottom:1px solid var(--border);}
  td{padding:8px 10px;border-bottom:1px solid var(--border);}
  hr{border:none;border-top:1px solid var(--border);margin:36px 0;}
  .note{background:var(--cream);border-left:2px solid var(--gold);padding:14px 18px;border-radius:0 8px 8px 0;font-size:13px;color:#5a5346;margin:16px 0;}
  .note em{color:#5a5346;}
  footer{text-align:center;padding:24px 20px;background:var(--dark);border-top:1px solid rgba(184,146,58,.15);}
  .flogo{font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--gold);font-weight:300;letter-spacing:.06em;margin-bottom:4px;}
  .ftag{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#6a5a3a;}
  .flinks{margin-top:10px;font-family:'DM Sans',sans-serif;font-size:11px;}
  .flinks a{color:#8a7550;text-decoration:none;margin:0 8px;}
  .flinks a:hover{color:var(--gold);}
  .price-block{background:var(--dark);border-radius:12px;padding:24px 28px;margin:16px 0 24px;text-align:center;}
  .price-main{font-family:'Cormorant Garamond',serif;font-weight:300;color:var(--gold);line-height:1;}
  .price-num{font-size:56px;}
  .price-unit{font-family:'DM Mono',monospace;font-size:12px;color:#8a7550;letter-spacing:.06em;margin-left:4px;}
  .price-sub{font-family:'DM Mono',monospace;font-size:11px;color:#6a5a3a;letter-spacing:.04em;margin-top:8px;}
</style>
</head>
<body>
<div class="topbar">
  <a href="/">Privency</a>
  <span>Conditions générales de vente</span>
</div>
<div class="wrap">
<h1>Conditions Générales de Vente</h1>
<span class="updated">En vigueur au 9 juillet 2026</span>
<h2>Article 1 — Objet et champ d'application</h2>
<p>Les présentes Conditions Générales de Vente (CGV) régissent la souscription à l'abonnement Privency, service édité par Olivier Loison, Entreprise Individuelle, SIRET 501 159 404 00059, 85 B Rue du Bois de Châtres, 91220 Brétigny-sur-Orge.</p>
<p>Privency est un service en ligne (SaaS) réservé aux professionnels de l'immobilier (mandataires, agents commerciaux, agences), permettant de générer des mini-sites privés ("fiches acheteur") à destination de leurs clients acquéreurs, avant et/ou après la visite d'un bien.</p>
<p>Toute souscription à l'abonnement implique l'acceptation pleine et entière des présentes CGV, à l'exclusion de tout autre document.</p>
<h2>Article 2 — Description du service</h2>
<p>L'abonnement Privency donne accès à :
- La génération de fiches acheteur personnalisées (analyse financière, DPE, carte de quartier, simulation de crédit, comparables de transactions DVF, chatbot IA disponible 24h/24)
- Un tableau de bord de suivi des fiches créées et de leur consultation par les acquéreurs
- L'hébergement et la mise en ligne des fiches générées</p>
<p>Le service est réservé à un usage professionnel (B2B). Il n'est pas destiné aux particuliers agissant en dehors de toute activité professionnelle.</p>
<h2>Article 3 — Tarifs et modalités de paiement</h2>
<p>L'abonnement est facturé, sans engagement de durée :</p>
<div class="price-block">
  <div class="price-main"><span class="price-num">49</span> € HT<span class="price-unit"> / mois</span></div>
  <div class="price-sub">soit 58,80 € TTC (TVA au taux normal de 20 %)</div>
</div>
<p>Une période d'essai gratuite de <strong>14 jours</strong> est proposée à la première souscription, avec enregistrement obligatoire d'une carte bancaire. Sauf résiliation avant le terme de cette période, l'abonnement est automatiquement reconduit et le premier prélèvement intervient à l'issue des 14 jours.</p>
<p>Le paiement s'effectue par carte bancaire via la plateforme sécurisée Stripe. Le renouvellement est mensuel et automatique, à la même date anniversaire, jusqu'à résiliation par le client.</p>
<p>En cas d'échec de paiement, le service pourra être suspendu jusqu'à régularisation. Olivier Loison se réserve le droit de faire évoluer ses tarifs, moyennant un préavis d'au moins 30 jours notifié aux abonnés en cours.</p>
<h2>Article 4 — Durée, résiliation et rétractation</h2>
<p>L'abonnement est sans engagement de durée et résiliable à tout moment par le client, avec effet à la fin de la période mensuelle en cours (aucun remboursement au prorata du mois entamé).</p>
<p>S'agissant d'un contrat conclu entre professionnels, le droit de rétractation prévu par le Code de la consommation ne s'applique pas.</p>
<p>Olivier Loison se réserve le droit de suspendre ou résilier un abonnement en cas de manquement grave du client aux présentes CGV (usage frauduleux, non-paiement persistant, atteinte à l'image ou au bon fonctionnement du service), après mise en demeure restée infructueuse.</p>
<h2>Article 5 — Obligations du client</h2>
<p>Le client s'engage à :
- Utiliser le service dans le cadre exclusif de son activité professionnelle immobilière
- Fournir des informations exactes sur les biens et transactions présentés dans les fiches qu'il génère
- Ne pas diffuser via le service de contenu illicite, trompeur ou portant atteinte aux droits de tiers
- Assurer la véracité des informations personnelles qu'il transmet concernant ses clients acquéreurs, et disposer d'une base légale pour les traiter</p>
<p>Le client demeure seul responsable du contenu des fiches qu'il crée et des informations qu'il y intègre.</p>
<h2>Article 6 — Propriété intellectuelle</h2>
<p>Le logiciel, la plateforme, les gabarits de fiches, la charte graphique et l'ensemble des éléments techniques de Privency demeurent la propriété exclusive d'Olivier Loison. L'abonnement confère au client un droit d'usage personnel, non exclusif et non transférable, pour la durée de son abonnement.</p>
<p>Les données et contenus propres au client (informations sur les biens, coordonnées de ses clients acquéreurs) restent sa propriété.</p>
<h2>Article 7 — Données personnelles</h2>
<p>Dans le cadre de l'utilisation du service, le client (agent immobilier) est amené à saisir des données personnelles concernant ses propres clients acquéreurs (nom, prénom, et le cas échéant d'autres informations) dans les fiches qu'il génère.</p>
<p>Le client agit en qualité de responsable de traitement pour les données de ses clients acquéreurs qu'il intègre dans le service ; Olivier Loison agit en qualité de sous-traitant au sens du RGPD pour l'hébergement et le traitement technique de ces données, dans le cadre strict des instructions du client et des présentes CGV.</p>
<p>Olivier Loison met en œuvre les mesures techniques raisonnables pour assurer la sécurité des données hébergées (authentification, restriction d'accès). Les modalités complètes de traitement des données sont précisées dans la Politique de confidentialité du service.</p>
<div class="note">Note : cette répartition responsable de traitement / sous-traitant est une clause standard pour ce type de service. Une vérification par un professionnel est recommandée avant publication, notamment parce que la donnée traitée (informations sur des acquéreurs immobiliers) peut être sensible sur le plan commercial.</div>

<h2>Article 8 — Disponibilité et responsabilité</h2>
<p>Olivier Loison s'efforce d'assurer un accès continu au service, sans garantie de disponibilité absolue (maintenance, panne des prestataires techniques tiers — hébergement, base de données, paiement). Le service est fourni "en l'état".</p>
<p>La responsabilité d'Olivier Loison ne saurait être engagée en cas d'interruption temporaire du service, de perte de données imputable à un prestataire tiers, ou d'utilisation non conforme du service par le client. Les simulations financières et comparables de marché fournis via le service ont une valeur indicative et ne constituent pas un conseil professionnel engageant.</p>
<p>En tout état de cause, la responsabilité d'Olivier Loison est limitée au montant des sommes versées par le client au titre des trois derniers mois d'abonnement.</p>
<h2>Article 9 — Force majeure</h2>
<p>Aucune des parties ne pourra être tenue responsable envers l'autre en cas de non-exécution de ses obligations résultant d'un cas de force majeure au sens de l'article 1218 du Code civil.</p>
<h2>Article 10 — Modification des CGV</h2>
<p>Olivier Loison se réserve le droit de modifier les présentes CGV à tout moment. Les CGV applicables sont celles en vigueur à la date de souscription ou de renouvellement de l'abonnement. Le client sera informé de toute modification substantielle par email, avant son entrée en vigueur.</p>
<h2>Article 11 — Droit applicable et litiges</h2>
<p>Les présentes CGV sont soumises au droit français. En cas de litige relatif à leur interprétation ou leur exécution, les parties s'efforceront de trouver une solution amiable. À défaut, le litige sera porté devant les tribunaux compétents du ressort du siège d'Olivier Loison.</p>
<hr />
<span class="updated">Dernière mise à jour : 9 juillet 2026</span>
</div>
<footer>
  <div class="flogo">Privency</div>
  <div class="ftag">Le mandat exclusif, sans compétence technique</div>
  <div class="flinks">
    <a href="/mentions-legales.html">Mentions légales</a>·
    <a href="/cgv.html">CGV</a>·
    <a href="/politique-confidentialite.html">Politique de confidentialité</a>
  </div>
</footer>
</body>
</html>
HTMLEOF

cat > politique-confidentialite.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Politique de confidentialité — Privency</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#f4f1ea;--card:#fff;--ink:#111;--gold:#b8923a;--gold2:#d4a956;--cream:#ede9df;--muted:#888880;--border:#ddd8cc;--dark:#141414;}
  *{box-sizing:border-box;}
  body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--ink);margin:0;line-height:1.7;}
  .topbar{background:var(--dark);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;}
  .topbar a{font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--gold);text-decoration:none;font-weight:400;letter-spacing:.03em;}
  .topbar span{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6a5a3a;}
  .wrap{max-width:760px;margin:0 auto;padding:56px 24px 80px;}
  h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:clamp(30px,5vw,44px);color:var(--dark);margin:0 0 8px;}
  .updated{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:40px;display:block;}
  h2{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:24px;color:var(--dark);margin:40px 0 14px;padding-top:20px;border-top:1px solid var(--border);}
  h2:first-of-type{border-top:none;padding-top:0;}
  p{font-size:15px;color:#333;margin:0 0 14px;}
  ul,ol{font-size:15px;color:#333;padding-left:22px;margin:0 0 14px;}
  li{margin-bottom:6px;}
  strong{color:var(--dark);font-weight:600;}
  em{color:var(--muted);}
  a{color:var(--gold);}
  table{width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;}
  th{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 10px;background:var(--cream);border-bottom:1px solid var(--border);}
  td{padding:8px 10px;border-bottom:1px solid var(--border);}
  hr{border:none;border-top:1px solid var(--border);margin:36px 0;}
  .note{background:var(--cream);border-left:2px solid var(--gold);padding:14px 18px;border-radius:0 8px 8px 0;font-size:13px;color:#5a5346;margin:16px 0;}
  .note em{color:#5a5346;}
  footer{text-align:center;padding:24px 20px;background:var(--dark);border-top:1px solid rgba(184,146,58,.15);}
  .flogo{font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--gold);font-weight:300;letter-spacing:.06em;margin-bottom:4px;}
  .ftag{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#6a5a3a;}
  .flinks{margin-top:10px;font-family:'DM Sans',sans-serif;font-size:11px;}
  .flinks a{color:#8a7550;text-decoration:none;margin:0 8px;}
  .flinks a:hover{color:var(--gold);}
</style>
</head>
<body>
<div class="topbar">
  <a href="/">Privency</a>
  <span>Politique de confidentialité</span>
</div>
<div class="wrap">
<h1>Politique de confidentialité</h1>
<span class="updated">En vigueur au 9 juillet 2026</span>
<h2>Responsable de traitement</h2>
<p>Le responsable du traitement des données personnelles collectées via le site et l'application Privency est :</p>
<p><strong>LOISON Olivier</strong>, Entreprise Individuelle
SIRET 501 159 404 00059
85 B Rue du Bois de Châtres, 91220 Brétigny-sur-Orge, France
Email : olivier.loison@expertimo.com</p>
<p>Cette politique s'applique à deux catégories de personnes distinctes : les <strong>agents immobiliers abonnés</strong> au service, et les <strong>acquéreurs</strong> destinataires des fiches générées par ces agents.</p>
<h2>Données collectées</h2>
<h3>Pour les agents abonnés</h3>
<ul>
<li>Identité : nom, prénom, email, téléphone</li>
<li>Données de connexion : identifiants de compte, historique de connexion</li>
<li>Données de paiement : traitées directement par Stripe ; Privency ne stocke ni ne voit jamais votre numéro de carte bancaire</li>
<li>Contenu créé : fiches acheteur générées (informations sur les biens, données saisies concernant vos clients acquéreurs)</li>
</ul>
<h3>Pour les acquéreurs (destinataires d'une fiche)</h3>
<ul>
<li>Nom et prénom, transmis par l'agent immobilier lors de la création de la fiche (paramètres d'URL personnalisée)</li>
<li>Données de consultation de la fiche : pages/onglets consultés, horodatage, actions réalisées (ex. simulation de crédit, envoi d'une offre) — collectées à des fins de statistiques d'usage à destination de l'agent</li>
<li>Échanges avec le chatbot IA intégré à la fiche, le cas échéant</li>
</ul>
<h2>Finalités et bases légales</h2>
<table>
<thead>
<tr>
<th>Finalité</th>
<th>Base légale</th>
</tr>
</thead>
<tbody>
<tr>
<td>Fourniture du service et gestion du compte agent</td>
<td>Exécution du contrat d'abonnement</td>
</tr>
<tr>
<td>Facturation et paiement</td>
<td>Exécution du contrat / obligation légale (comptabilité)</td>
</tr>
<tr>
<td>Génération et hébergement des fiches acheteur</td>
<td>Exécution du contrat conclu avec l'agent, pour le compte duquel Privency agit comme sous-traitant à l'égard des données de l'acquéreur</td>
</tr>
<tr>
<td>Statistiques de consultation des fiches</td>
<td>Intérêt légitime de l'agent à suivre l'engagement de son client</td>
</tr>
<tr>
<td>Réponses du chatbot IA</td>
<td>Exécution du contrat / intérêt légitime</td>
</tr>
<tr>
<td>Amélioration et sécurité du service</td>
<td>Intérêt légitime</td>
</tr>
</tbody>
</table>
<h2>Destinataires et sous-traitants</h2>
<p>Les données sont hébergées et traitées par les prestataires suivants, dans le cadre strict de la fourniture du service :</p>
<ul>
<li><strong>Supabase Inc.</strong> — base de données et authentification</li>
<li><strong>Vercel Inc.</strong> — hébergement de l'application et des fonctions techniques (dont la carte de quartier et le chatbot)</li>
<li><strong>GitHub, Inc.</strong> — hébergement des fiches acheteur publiées (GitHub Pages)</li>
<li><strong>Cloudinary Ltd.</strong> — stockage des photographies des biens</li>
<li><strong>Stripe Payments Europe, Ltd.</strong> — traitement des paiements</li>
<li><strong>Anthropic</strong> — fourniture du modèle d'intelligence artificielle utilisé par le chatbot ; les messages échangés avec le chatbot sur une fiche sont transmis à cette API pour générer une réponse</li>
</ul>
<p>Ces prestataires n'utilisent les données que pour exécuter les services techniques qui leur sont confiés et n'en font aucun usage commercial propre. Certains de ces prestataires étant établis hors de l'Union européenne (États-Unis), les transferts de données sont encadrés par les garanties prévues par ces prestataires (clauses contractuelles types de la Commission européenne ou mécanisme équivalent).</p>
<div class="note">Note pour Olivier : je te recommande de vérifier, pour chaque prestataire listé ci-dessus, qu'il propose bien une clause de sous-traitance RGPD (DPA) et de la signer/accepter si ce n'est pas déjà fait — c'est en général disponible gratuitement dans les paramètres de compte de chaque service.</div>

<h2>Durée de conservation</h2>
<ul>
<li><strong>Données du compte agent</strong> : conservées pendant toute la durée de l'abonnement. À ce jour, la résiliation d'un abonnement n'entraîne pas de suppression automatique des données ; celles-ci sont supprimées sur demande de l'agent adressée à olivier.loison@expertimo.com, dans un délai raisonnable. Une automatisation de cette suppression est à l'étude.</li>
<li><strong>Fiches acheteur et données associées</strong> : conservées tant que le compte agent existe, ou jusqu'à suppression manuelle par l'agent ou sur sa demande</li>
<li><strong>Statistiques de consultation</strong> : conservées dans les mêmes conditions que les fiches auxquelles elles se rattachent</li>
</ul>
<div class="note">Note pour Olivier : ce paragraphe reflète maintenant fidèlement le fonctionnement réel vérifié dans le code (le webhook de résiliation Stripe ne fait que changer un statut, il ne supprime rien). C'est moins séduisant qu'une suppression automatique, mais c'est honnête — et c'est ce qui compte légalement. Ajouter une vraie purge automatique reste une bonne amélioration à prévoir.</div>

<h2>Droits des personnes concernées</h2>
<p>Conformément au RGPD et à la loi Informatique et Libertés, toute personne concernée (agent ou acquéreur) dispose des droits suivants sur ses données :
- Droit d'accès et de rectification
- Droit à l'effacement
- Droit à la limitation du traitement
- Droit d'opposition
- Droit à la portabilité</p>
<p>Pour un <strong>acquéreur</strong> souhaitant exercer ces droits sur une fiche le concernant, la demande doit être adressée en priorité à l'agent immobilier qui a créé la fiche (responsable de traitement pour cette donnée), ou à défaut à olivier.loison@expertimo.com, qui la transmettra.</p>
<p>Pour un <strong>agent abonné</strong>, la demande peut être adressée directement à olivier.loison@expertimo.com.</p>
<p>Vous disposez également du droit d'introduire une réclamation auprès de la CNIL (www.cnil.fr).</p>
<h2>Sécurité</h2>
<p>Privency met en œuvre des mesures techniques raisonnables pour protéger les données hébergées : authentification sécurisée, restriction d'accès aux données par compte, chiffrement des communications (HTTPS). Aucun système n'étant infaillible, Privency s'engage à notifier toute violation de données conformément aux obligations légales applicables.</p>
<h2>Cookies</h2>
<p>Le site utilise des cookies techniques nécessaires à l'authentification et au bon fonctionnement du service. Aucun cookie publicitaire tiers n'est utilisé à ce jour.</p>
<h2>Modification de la politique</h2>
<p>Cette politique peut être mise à jour pour refléter l'évolution du service ou de la réglementation. La version en vigueur est celle publiée sur le site à la date de consultation.</p>
<h2>Contact</h2>
<p>Pour toute question relative à cette politique ou à vos données personnelles : olivier.loison@expertimo.com</p>
<hr />
<span class="updated">Dernière mise à jour : 9 juillet 2026</span>
</div>
<footer>
  <div class="flogo">Privency</div>
  <div class="ftag">Le mandat exclusif, sans compétence technique</div>
  <div class="flinks">
    <a href="/mentions-legales.html">Mentions légales</a>·
    <a href="/cgv.html">CGV</a>·
    <a href="/politique-confidentialite.html">Politique de confidentialité</a>
  </div>
</footer>
</body>
</html>
HTMLEOF


git add mentions-legales.html cgv.html politique-confidentialite.html
git commit -m "feat: ajout des pages mentions légales, CGV et politique de confidentialité"

echo "=== Fichiers créés et commités. Passer maintenant aux modifications de footer. ==="
