# Expertimo / Privency — règles du dépôt

## Fiches acheteur : toute fiche en ligne doit être inscrite

Le dossier `fiches/` est publié tel quel sur espace.privency.fr. « Mes stats » et « Modifier » ne
connaissent que les fiches inscrites dans Supabase : `agent_fiches` (stats) et `fiche_private` (données privées).
Une fiche ajoutée au dépôt sans inscription est en ligne mais invisible pour l'agent.

- Le bouton « Publier » (`api/fiche-publish.js`) inscrit puis publie : rien à faire.
- **Toute autre création de fichier dans `fiches/`** (copie sous lien court, renommage, import, script) doit être suivie de :
  `SUPABASE_SECRET_KEY=... node scripts/inscrire-fiche.js fiches/NOUVELLE-FINAL.html --depuis fiches/ORIGINALE-FINAL.html`
  (ou `--sans-prive` s'il n'y a rien à copier). Si la clé n'est pas disponible, dire explicitement à l'utilisateur
  que la fiche n'est PAS inscrite et lui donner la commande — ne jamais laisser croire que c'est terminé.
- Vérification : `node scripts/inscrire-fiche.js --verifier` liste les fiches non inscrites (une GitHub Action le fait à
  chaque push sur `main` touchant `fiches/`, en avertissement, sans bloquer).
- Test : `node tests/inscription-fiches.test.js`.
