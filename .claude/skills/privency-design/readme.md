# Skill : privency-design

Design system de Privency (SaaS immobilier). À utiliser pour TOUTE création ou refonte
d'interface sur ce dépôt (pages agent, pages publiques, fiches acheteur).

## Fichiers du système

- **`/design-system.css`** (racine du dépôt) — les tokens (couleurs, typo, espacements,
  rayons, ombres) et les composants de base déjà prêts à l'emploi : `.btn` /
  `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-block`, `.card` /
  `.card-fill` / `.card-accent`, `.badge` (+ variantes `-green`/`-red`/`-amber`),
  `.field` / `.label` / `.checkbox`, `.alert` / `.alert-error` / `.alert-success`,
  `.check-list`, `.eyebrow`, `.container` / `.section` / `.section-alt`, utilitaires
  texte (`.text-muted`, `.text-brand`, `.data`). C'est le fichier à lier dans le
  `<head>` de chaque page :
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/design-system.css">
  ```
- **`/design-principles.md`** (racine du dépôt) — les règles : usage de la couleur,
  hiérarchie des boutons, états obligatoires des composants, layout, accessibilité,
  ton/microcopy, motion, iconographie, composants métier restant à construire,
  anti-patterns. À lire avant toute décision de design non couverte ci-dessous.
- **`guidelines/apercu.html`** (ce dossier) — page de prévisualisation de tous les
  tokens et composants de base. À ouvrir dans un navigateur pour voir le rendu réel.

## Les 5 règles clés (résumé express)

1. Un seul accent emerald `#0E9F6E` (`--brand-500`), réservé aux actions et au statut
   "validé" — jamais en déco. 90% de l'écran reste blanc/gris/encre. Jamais d'or ni de
   dégradé.
2. Une seule police : **Plus Jakarta Sans** (texte) + **JetBrains Mono** pour les
   données chiffrées (`.data`).
3. Français, vouvoiement, verbes concrets sur les boutons ("Estimer", "Créer une
   fiche") — jamais "Soumettre" ou "Valider".
4. Icônes Lucide uniquement, trait 1.5–2px. Le motif de marque est la coche cerclée
   (`.check-list`).
5. Rayons généreux (`--r-md`/`--r-lg`), cibles tactiles 44px minimum, focus clavier
   toujours visible (jamais `outline:none` sans remplacement).

La marque = le mot **"Privency"** avec **"cy" en emerald** (`<b>` ou `<span>` coloré en
`--brand-500`), il n'y a pas de logo vectoriel pour l'instant.

## État du système (honnêteté à jour)

Ce qui existe aujourd'hui et est prêt à l'emploi : les tokens + les composants de base
listés ci-dessus (boutons, cartes, badges, champs, alertes, liste à coches). Ce qui
reste à construire au fil des refontes de page : les composants métier Privency
(carte de bien, en-tête de fiche, widget d'estimation, tableau de comparables,
simulateur investisseur, barre DPE, formulaire d'offre, panneau de suivi des vues...
liste complète dans `design-principles.md` §9). Construis-les au fur et à mesure des
pages qui en ont besoin, avec les tokens ci-dessus — pas avant, pour éviter de deviner
un composant avant d'avoir une vraie page où le tester.

## Méthode pour restyler une page

1. Ne touche jamais à la logique métier (appels Supabase/Stripe/API, `id` des éléments
   utilisés par le JavaScript de la page) — seulement au HTML/CSS visuel.
2. Remplace le `<style>` embarqué existant par le lien vers `/design-system.css`, garde
   uniquement en local le CSS propre à la mise en page de cette page précise (elle ne
   doit pas redéfinir les tokens ni dupliquer les composants de base).
3. Réutilise les classes existantes (`.btn-primary`, `.card`, `.field`, `.label`,
   `.alert-error`...) plutôt que d'en inventer de nouvelles pour la même chose.
4. Si un vrai nouveau composant réutilisable apparaît (pas juste une mise en page
   ponctuelle), ajoute-le à `/design-system.css` avec les tokens existants, puis
   documente-le dans `design-principles.md` §9.
5. Teste mobile (< 640px) et desktop, vérifie le focus clavier, vérifie le contraste
   du texte vert (`--brand-700`, jamais `--brand-500` en petit texte).
6. Travaille sur la branche `dev`, jamais sur `main`.
