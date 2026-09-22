# Privency — Principes & règles du design system

Ce document accompagne `design-system.css`. Le CSS donne les tokens (couleurs, typo,
espacements). Ce fichier donne les **règles** : quand et comment les utiliser. Toute
page ou composant de Privency doit respecter ces règles.

Direction : SaaS immobilier moderne, clair et rassurant (référence Bunji). Blanc
dominant, beaucoup d'air, un seul accent vert émeraude, sans-serif Plus Jakarta Sans.

---

## 1. Règles d'usage de la couleur

- **Un seul accent : le vert `--brand-500` (#0E9F6E).** Il est réservé aux actions et au
  statut "validé". Jamais en décoration, jamais pour remplir un fond "parce que c'est joli".
- **90% de l'écran est neutre** (blanc, gris, encre). Le vert doit rester rare pour garder
  sa force. Si tout est vert, plus rien ne ressort.
- **Fonds :** blanc `--white` par défaut. `--gray-50` pour alterner une section sur deux.
  `--brand-50` (vert pâle) uniquement pour mettre en avant UN bloc (offre, plan populaire).
- **Sémantique :** rouge = erreur/suppression, ambre = attention, vert = succès. Ne jamais
  utiliser le rouge pour autre chose qu'une alerte.
- **Interdits :** dégradés violets/bleus, or, ombres colorées criardes, plus d'une couleur
  d'accent. Ce sont les marqueurs du "look AI générique".

## 2. Hiérarchie des boutons

- **Un seul bouton primaire (`.btn-primary`, vert) par écran ou par section.** C'est
  l'action principale que tu veux que l'utilisateur fasse.
- Tout le reste en `.btn-secondary` (contour) ou `.btn-ghost` (texte).
- Le bouton primaire ne se répète pas 5 fois sur une page. S'il y a plusieurs zones, une
  seule porte le primaire, les autres le secondaire.
- Verbe d'action clair sur le bouton, jamais "Soumettre" ou "Cliquez ici".

## 3. États des composants (obligatoires)

Chaque composant interactif doit définir ses états. Minimum requis :

| Composant | repos | hover | focus (clavier) | actif | désactivé | erreur / chargement |
|-----------|-------|-------|-----------------|-------|-----------|---------------------|
| Bouton    | ✓     | ✓     | contour visible | léger enfoncement | opacité .5, curseur interdit | spinner + texte "..." |
| Champ     | ✓     | bordure plus foncée | bordure verte + halo `--brand-50` | | fond gris, non éditable | bordure rouge + message dessous |
| Carte cliquable | ✓ | légère élévation | contour visible | | | |
| Lien      | ✓     | soulignement | contour visible | | | |

Règle : le **focus clavier ne se supprime jamais** (`outline:none` sans remplacement est
interdit). C'est une faute d'accessibilité.

## 4. Système de mise en page

- **Conteneur :** largeur max 1200px, centré, marge latérale mini 24px (`--s-5`).
- **Points de rupture :** mobile < 640px, tablette 640-1024px, desktop > 1024px.
  Tout doit être pensé mobile d'abord.
- **Rythme vertical :** sections espacées de `--s-9` (96px) en desktop, `--s-7` (48px) en
  mobile. C'est cet espacement généreux qui donne le "respire" façon Bunji.
- **Crée de la tension :** alterne des blocs denses et des grands vides. Ne mets pas tout
  au même espacement, c'est ce qui donne l'effet plat et générique.
- **Largeur de lecture :** un paragraphe ne dépasse jamais 65 caractères de large (`max-width:62ch`).

## 5. Accessibilité (non négociable)

- **Contraste texte :** 4.5:1 minimum pour le texte normal, 3:1 pour le grand texte.
  Attention : le vert `--brand-500` sur blanc ne passe PAS en petit texte. Pour du texte
  vert lisible, utiliser `--brand-700` (#0A6F4D). Le vert vif reste pour les fonds de
  boutons (texte blanc dessus) et les gros éléments.
- **Cibles tactiles :** 44x44px minimum sur mobile (boutons, liens, icônes cliquables).
- **Focus visible** sur tous les éléments interactifs (voir section 3).
- **Images :** toujours un attribut `alt` décrivant le contenu.
- **Formulaires :** chaque champ a un `<label>` associé, pas juste un placeholder.

## 6. Ton & microcopy

- **Vouvoiement** partout ("Estimez votre bien", pas "Estime ton bien").
- **Casse phrase** pour les titres et boutons ("Prendre rendez-vous", pas "PRENDRE RENDEZ-VOUS").
- **Verbes concrets** sur les boutons : "Estimer", "Créer une fiche", "Déposer une offre".
  Jamais "Valider", "Soumettre", "OK".
- **Ton pro mais accessible :** on parle à un agent immobilier ou à un acheteur, pas à un
  développeur. Pas de jargon technique côté utilisateur.
- **Chiffres en évidence :** les données (nombre de mandats, %, prix) en police mono
  `--font-mono` avec `font-variant-numeric:tabular-nums` pour l'alignement.

## 7. Motion

- **Une seule durée standard :** 200ms, courbe `cubic-bezier(.4,0,.2,1)` (déjà dans `--ease`).
- On anime : les hovers, les apparitions de menu/modale, les changements d'état.
- On n'anime pas : le texte au chargement, les éléments à outrance. Sobre.
- Respecter `prefers-reduced-motion` : couper les animations pour les utilisateurs qui le
  demandent.

## 8. Iconographie

- **Un seul jeu d'icônes** sur tout le produit. Recommandé : Lucide (open source, trait fin,
  moderne, cohérent avec l'esprit clair). Ne pas mélanger plusieurs styles d'icônes.
- Trait de 1.5 à 2px, taille 20 ou 24px, couleur héritée du texte (`currentColor`).
- Icône toujours accompagnée de texte pour une action importante, jamais seule si l'action
  n'est pas évidente.

## 9. Composants métier Privency (à créer)

C'est ce qui rend le système utile pour CE produit. Chacun se construit avec les tokens
ci-dessus. À définir et standardiser :

- **Carte de bien** : photo, prix (mono), ville + type + surface, badge statut, CTA "Voir la fiche".
- **En-tête de fiche** : adresse, prix, caractéristiques clés en ligne, bouton de partage.
- **Widget d'estimation** : champ ville/adresse, résultat prix bas/moyen/haut, barre de confiance.
- **Bloc comparables** : liste de biens vendus similaires, en tableau lisible.
- **Simulateur investisseur** : entrées (prix, loyer, charges), sorties (rendement, cash-flow).
- **Bloc diagnostics** : étiquettes DPE/GES colorées standardisées.
- **Formulaire d'offre d'achat** : montant, conditions, coordonnées, envoi.
- **Espace acheteur privé** : navigation entre les sections de la fiche, accès sécurisé.
- **États vides** : que montrer quand il n'y a pas encore de fiche, pas de lead, etc.
  (illustration + phrase + bouton d'action). Souvent oublié, essentiel dans un SaaS.

## 10. Anti-patterns (à ne jamais faire)

- Tout mettre en cartes blanches à ombre douce. Varier : blanc bordé, rempli gris, accent.
- Empiler des sections au même espacement sans rythme.
- Utiliser le vert partout jusqu'à ce qu'il ne veuille plus rien dire.
- Dégradés violets, effets "glassmorphism" à outrance, ombres colorées.
- Placeholders sans label, focus supprimé, texte sur fond à faible contraste.
- Deux polices display concurrentes. Une seule famille : Plus Jakarta Sans.

---

*Référence interne Privency. Toute évolution du design passe par ce fichier + `design-system.css`.*
