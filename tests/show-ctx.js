// Affiche le contexte chatbot (_chat_ctx) embarqué dans une fiche générée. Usage : node tests/show-ctx.js <fichier.html>
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(process.env.TEMP, 'live', 'TEST-fiche-ok.html');
const h = fs.readFileSync(file, 'utf8');
const start = h.indexOf('var _chat_ctx = ') + 'var _chat_ctx = '.length;
const end = h.indexOf(';\n', start);
const ctx = JSON.parse(h.slice(start, end));
console.log(ctx);
console.log('--- longueur :', ctx.length, '| DPE dans le contexte :', /DPE/.test(ctx));
console.log('_sp_dpe =', (h.match(/var _sp_dpe *= *"([^"]*)"/) || [])[1]);
