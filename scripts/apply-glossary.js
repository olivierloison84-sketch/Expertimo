// Glossaire imposé PT-PT / ES appliqué aux libellés I18N de index.html (et aux motifs de remplacement associés dans app.html).
// Remplacements exacts et uniques : le script s'arrête si une chaîne est absente ou ambiguë. Usage : node scripts/apply-glossary.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const edits = {
  'index.html': [
    // ── PT (Portugal) ──
    ['"doc-charges": "Chamadas de encargos"', '"doc-charges": "Encargos de condomínio"'],
    ['Quanto mais explorar o dossiê,', 'Quanto mais explorar o dossier,'],
    ['"step-promesse": "Promessa"', '"step-promesse": "Contrato-promessa"'],
    ['"etape2-titre": "PASSO 2 · ASSINATURA DA PROMESSA"', '"etape2-titre": "PASSO 2 · ASSINATURA DO CONTRATO-PROMESSA DE COMPRA E VENDA"'],
    ['"etape5-txt": "Cerca de 3 meses após a promessa —', '"etape5-txt": "Cerca de 3 meses após o contrato-promessa de compra e venda —'],
    ['o valor, o seu nome e o seu email."', 'o valor, o seu nome e o seu e-mail."'],
    ['"docs-missing": "Indique o seu nome e o seu email."', '"docs-missing": "Indique o seu nome e o seu e-mail."'],
    ['€ sem mobília.', '€ não mobilado.'],
    // ── ES ──
    ['"doc-charges": "Llamadas de gastos"', '"doc-charges": "Gastos de comunidad"'],
    ['"cons-role": "Agente inmobiliario · Expertimo"', '"cons-role": "Asesor inmobiliario · Expertimo"'],
    ['"slbl-charges-sm": "Comunidad+seguro+imp. inmuebles"', '"slbl-charges-sm": "Gastos de comunidad+seguro+imp. inmuebles"'],
    ['Su solicitud se transmite al agente."', 'Su solicitud se transmite al asesor."'],
    ['El agente se pondrá en contacto con usted en 24 h', 'El asesor se pondrá en contacto con usted en 24 h'],
    ['"doc-pv-ag-desc": "Última junta de la comunidad"', '"doc-pv-ag-desc": "Última junta de la comunidad de propietarios"'],
    ['"doc-reglement": "Estatutos de la comunidad"', '"doc-reglement": "Estatutos de la comunidad de propietarios"'],
    ['"doc-reglement-desc": "Documentos de la comunidad"', '"doc-reglement-desc": "Documentos de la comunidad de propietarios"'],
    ['"step-promesse": "Compromiso"', '"step-promesse": "Promesa"'],
    ['Será transmitida al agente y al vendedor', 'Será transmitida al asesor y al vendedor'],
    ['"etape2-titre": "PASO 2 · FIRMA DEL COMPROMISO"', '"etape2-titre": "PASO 2 · FIRMA DE LA PROMESA DE COMPRAVENTA"'],
    ['Unos 3 meses después del compromiso —', 'Unos 3 meses después de la promesa de compraventa —'],
    ['"footer-tagline": "Inmobiliaria con la experiencia de un profesional"', '"footer-tagline": "Su proyecto inmobiliario, con la experiencia de un profesional"'],
    ['Olivier Loison · Agente Expertimo · olivier.loison@expertimo.com', 'Olivier Loison · Asesor Expertimo · olivier.loison@expertimo.com'],
    ['"agent-fallback": "su agente"', '"agent-fallback": "su asesor"']
  ],
  'app.html': [
    ["'Agente inmobiliario · Expertimo', 'Agente inmobiliario · ' + d.agentReseau", "'Asesor inmobiliario · Expertimo', 'Asesor inmobiliario · ' + d.agentReseau"],
    ["Olivier Loison · Agente Expertimo · olivier.loison@expertimo.com',", "Olivier Loison · Asesor Expertimo · olivier.loison@expertimo.com',"],
    ["footerNamePtEs + ' · Agente ' + footerReseau", "footerNamePtEs + ' · Asesor ' + footerReseau"]
  ]
};
Object.keys(edits).forEach(f => {
  const p = path.join(root, f); let s = fs.readFileSync(p, 'utf8');
  edits[f].forEach(([a, b]) => {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error(f + ' : ' + n + ' occurrence(s) pour « ' + a.slice(0, 60) + ' »');
    s = s.replace(a, () => b);
  });
  fs.writeFileSync(p, s);
  console.log(f + ' : ' + edits[f].length + ' remplacements');
});
