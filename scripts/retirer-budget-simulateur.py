#!/usr/bin/env python3
"""Retire les onglets « Mon Budget » et « Simulateur investisseur » des fiches déjà publiées.

Usage : python3 scripts/retirer-budget-simulateur.py <fiche.html> [...] [--out DIR]
  - sans --out : réécrit les fiches sur place ;
  - avec --out : écrit les copies nettoyées dans DIR (fiches d'origine intactes).

Ce qui est retiré, et rien d'autre :
  - les boutons et sections « budget » et « rentabilite » ;
  - leurs fonctions (mensualite, calc, _calc, calcBank, calcBudget), l'init des curseurs et leurs appels ;
  - leurs traductions ;
  - les données de taux et de durée intégrées (creditDuree/Apport/Haut/Moyen/Bas) ;
  - sommaire en tuiles (nouveau design) : 8 étapes, 4 colonnes sur ordinateur, CSS du simulateur.
Chaque remplacement doit trouver exactement le nombre d'occurrences attendu : sinon la fiche est
signalée en échec et n'est pas écrite.
"""
import json, re, sys, os

class Echec(Exception):
    pass

def js_block_end(s, i):
    """Index juste après l'accolade fermante du bloc qui s'ouvre à la première '{' à partir de i.
    Ignore les chaînes ('", `) et commentaires."""
    i = s.index('{', i)
    depth = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c in '"\'`':
            q = c; i += 1
            while s[i] != q:
                if s[i] == '\\': i += 1
                i += 1
        elif s.startswith('//', i):
            i = s.index('\n', i)
            continue
        elif s.startswith('/*', i):
            i = s.index('*/', i) + 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise Echec('accolade non fermée')

def clean(s):
    nouveau = 'var SEQ=' in s
    log = []

    def sub(pat, repl, expect, flags=re.M, label=None):
        nonlocal s
        s2, n = re.subn(pat, repl, s, flags=flags)
        ok = (n == expect) if isinstance(expect, int) else (n in expect)
        if not ok:
            raise Echec('%s : %d occurrence(s), attendu %s' % (label or pat[:60], n, expect))
        s = s2
        log.append((label or pat[:40], n))

    def remove_function(name):
        nonlocal s
        m = list(re.finditer(r'^function ' + re.escape(name) + r'\(', s, re.M))
        if len(m) != 1:
            raise Echec('function %s : %d définition(s)' % (name, len(m)))
        a = m[0].start(); b = js_block_end(s, a)
        if s[b] == '\n': b += 1
        s = s[:a] + s[b:]
        log.append(('function ' + name, 1))

    def remove_section(sid):
        nonlocal s
        m = list(re.finditer(r'<section id="' + sid + r'" class="tab"(?: style="display: none;")?>', s))
        if len(m) != 1:
            raise Echec('section %s : %d' % (sid, len(m)))
        a = m[0].start()
        # commentaire « ONGLET : … » juste au-dessus, s'il existe
        c = re.search(r'<!-- ═+ ONGLET : [^\n]*-->\n$', s[:a])
        if c: a = c.start()
        depth, i = 0, m[0].start()
        for t in re.finditer(r'<section\b|</section>', s[i:]):
            depth += 1 if t.group(0) == '<section' else -1
            if depth == 0:
                b = i + t.end(); break
        else:
            raise Echec('section %s non fermée' % sid)
        while b < len(s) and s[b] == '\n': b += 1
        s = s[:a] + s[b:]
        log.append(('section ' + sid, 1))

    # 1. boutons du rail
    sub(r'^[ \t]*<button data-tab="(?:rentabilite|budget)" [^\n]*</button>\n', '', 2, label='boutons rail')
    # 2. sections
    remove_section('rentabilite')
    remove_section('budget')
    # 3. fonctions JS
    sub(r'^// ═══ FINANCEMENT \(stub[^\n]*\n', '', (0, 1), label='commentaire calcBank')
    sub(r'^// ═══ MON BUDGET ═══\n', '', (0, 1), label='commentaire MON BUDGET')
    for fn in ('mensualite', 'calc', '_calc', 'calcBank', 'calcBudget'):
        remove_function(fn)
    # init des curseurs (on garde var _sp_loyer : repli du contexte de l'assistant IA)
    sub(r'^// ═══ INIT — loyer slider initialisé depuis _sp_loyer ═══\n', "// Loyer estimé (repli du contexte de l'assistant IA)\n", 1, label='commentaire init')
    m = list(re.finditer(r"^\(function\(\) \{\n  var loyerSlider = document\.getElementById\('loyer'\);", s, re.M))
    if len(m) != 1: raise Echec('init curseur loyer : %d' % len(m))
    a = m[0].start(); b = js_block_end(s, a)
    if not s.startswith(')();\n', b): raise Echec('fin init curseur loyer')
    s = s[:a] + s[b + 5:]
    sub(r'^calc\(\);\ncalcBank\(\);\n\n?', '', 1, label='appels calc/calcBank')
    # préremplissage du prix de Mon Budget
    m = list(re.finditer(r"^document\.addEventListener\('DOMContentLoaded', function\(\) \{\n  var bgtPrix = ", s, re.M))
    if len(m) > 1: raise Echec('préremplissage bgt-prix : %d' % len(m))
    if m:
        a = m[0].start(); b = js_block_end(s, a)
        if not s.startswith(');\n', b): raise Echec('fin préremplissage bgt-prix')
        s = s[:a] + s[b + 3:]
    # écouteurs des curseurs + appels à l'init
    sub(r"^[ \t]*\['prix','loyer','apport','taux','duree','charges','travaux'\]\.forEach\(function\(id\)\{\n[ \t]*var el = document\.getElementById\(id\);\n[ \t]*if \(el\) el\.addEventListener\('input', calc\);\n[ \t]*\}\);\n", '', 1, label='écouteurs curseurs')
    sub(r"^[ \t]*try\{ calc\(\); \}catch\(e\)\{ console\.error\('\[init calc\]', e\); \}\n", '', 1, label='init calc')
    sub(r"^[ \t]*try\{ calcBank\(\); \}catch\(e\)\{ console\.error\('\[init calcBank\]', e\); \}\n", '', 1, label='init calcBank')
    # rafraîchissement au changement de langue
    sub(r"^[ \t]*try \{ calc\(\); \} catch\(e\) \{\}\n", '', (0, 1), label='langue calc')
    sub(r"^[ \t]*var bgtResult = document\.getElementById\('bgt-result'\);\n[ \t]*if \(bgtResult[^\n]*\n[ \t]*try \{ calcBudget\(\); \} catch\(e\) \{\}\n[ \t]*\}\n", '', (0, 1), label='langue calcBudget')
    # 4. navigation
    sub(r"^  var navMap = \{bien: 0, marche: 1, rentabilite: 2, historique: 3, diagnostics: 4, budget: 5, quartier: 6, documents: 7, offre: 9\};\n  var navBtns = document\.querySelectorAll\('#main-nav button'\);\n  showTab\(id, navBtns\[navMap\[id\]\]\);\n",
        "  showTab(id, document.querySelector('#main-nav button[data-tab=\"' + id + '\"]'));\n", 1, label='showTabById')
    sub(r"var tabMap = \{marche: 'marche', rentabilite: 'rentabilite', ", "var tabMap = {marche: 'marche', ", 1, label='showSub2')
    # 5. traductions des deux onglets
    keys = ['tab-rentabilite', 'tab-budget', 'lbl-simulateur', 'stitle-simulateur', 'charges-detail-default',
            'lbl-simulateur-perso', 'stitle-budget', 'ssub-budget', 'lbl-prix-vente', 'lbl-revenu', 'lbl-apport-dispo',
            'lbl-duree-credit', 'lbl-taux-budget', 'opt-15ans', 'opt-20ans', 'opt-25ans', 'btn-calc-budget',
            'disclaimer-budget', 'years-suffix', 'rent-info']
    pat = r'^[ \t]*([\'"])(?:' + '|'.join(map(re.escape, keys)) + r'|slbl-[a-z-]+|rcl-[a-z-]+|bgt-[a-z-]+)\1\s*:[^\n]*\n'
    s, n = re.subn(pat, '', s, flags=re.M)
    log.append(('traductions', n))
    # 6. compteurs « / 10 sections » et pied de page
    sub(r'/ 10 (sections|secções|secciones)', r'/ 8 \1', (2, 6, 10), label='compteurs / 10')
    for a, b in [('données DVF réelles, simulateur interactif et assistant IA', 'données DVF réelles et assistant IA'),
                 ('real DVF data, interactive simulator and AI', 'real DVF data and AI'),
                 ('dados DVF reais, simulador interativo e ', 'dados DVF reais e '),
                 ('datos DVF reales, simulador interactivo y ', 'datos DVF reales y ')]:
        sub(re.escape(a), b, (0, 1, 2, 3), label='pied ' + a[:20])
    # 7. données intégrées : taux et durée
    def strip_credit(m):
        body = m.group(2)
        before = json.loads(body)
        body2 = re.sub(r',"credit(?:Duree|Apport|Haut|Moyen|Bas)":-?[0-9.]+', '', body)
        after = json.loads(body2)
        exp = {k: v for k, v in before.items() if not re.match(r'credit(Duree|Apport|Haut|Moyen|Bas)$', k)}
        if after != exp or any(k.startswith('credit') for k in after):
            raise Echec('données intégrées : retrait des taux incomplet')
        return m.group(1) + body2 + m.group(3)
    s, n = re.subn(r'(<script id="expertimo-data(?:-[a-z]+)?" type="application/json">)(.*?)(</script>)', strip_credit, s, flags=re.S)
    log.append(('blocs de données', n))
    # 8. nouveau design : sommaire en tuiles
    if nouveau:
        sub(r"var SEQ=\['bien','historique','quartier','marche','diagnostics','documents','budget','rentabilite','assistant','offre'\];",
            "var SEQ=['bien','historique','quartier','marche','diagnostics','documents','assistant','offre'];", 1, label='SEQ')
        sub(r",budget:'Ce bien est-il fait pour vous \?',rentabilite:'Simulateur investisseur'", '', 1, label='DESC')
        sub(r"^    budget:'<path d=\"M3 7a2 2[^\n]*\n", '', 1, label='icône budget')
        sub(r"^    rentabilite:'<path d=\"M19 5 5 19\"/>[^\n]*\n", '', 1, label='icône rentabilite')
        sub(r"<h2>Votre visite en 10 étapes</h2><p>Touchez une étape pour l\\'ouvrir\. Les 10 sections",
            r"<h2>Votre visite en '+SEQ.length+' étapes</h2><p>Touchez une étape pour l\\'ouvrir. Les '+SEQ.length+' sections", 1, label='titre sommaire')
        sub(r"cl\.toggle\('pv-sim',mode===4&&state==='tab'&&id==='rentabilite'\);", '', 1, label='pv-sim JS')
        sub(r'@media\(min-width:700px\)\{body\.pv4\.pv-home \.rail\{grid-template-columns:repeat\(5,1fr\);\}\}',
            '@media(min-width:700px){body.pv4.pv-home .rail{grid-template-columns:repeat(4,1fr);}}', 1, label='tuiles 4 colonnes')
        sub(r'^body\.pv4\.pv-tab\.pv-sim #ai-btn\{[^\n]*\n', '', 1, label='CSS pv-sim')
        sub(r'^/\* simulateur : résultats toujours visibles \*/\n(?:body\.pv4 #sub-rentabilite[^\n]*\n)+@media\(max-width:700px\)\{\n(?:  body\.pv4 #sub-rentabilite[^\n]*\n)+  body\.pv4\.pv-sim\{[^\n]*\n\}\n', '', 1, label='CSS simulateur')
        sub(r'^body\.pv4 #sub-rentabilite \.rg\{[^\n]*\n', '', 1, label='CSS grille simulateur')
        sub(r',body\.pv #budget button\[onclick\*="calcBudget"\]\{', '{', 1, label='CSS bouton budget')
        sub(r'SOMMAIRE DES 10 ONGLETS', 'SOMMAIRE DES 8 ONGLETS', (0, 1), label='commentaire CSS')
        sub(r'les 10 sections toutes visibles', 'les 8 sections toutes visibles', (0, 1), label='commentaire CSS 2')
        sub(r'titre · n/10 »', 'titre · n/8 »', (0, 1), label='commentaire CSS 3')
    # 9. aucun reste
    restes = [p for p in [r'data-tab="(?:budget|rentabilite)"', r'id="(?:budget|rentabilite|sub-rentabilite|bgt-[a-z]+)"',
                          r'calcBudget', r'(?<![\w.])calc\(\)', r'calcBank', r'mensualite\(', r'"credit(?:Duree|Apport|Haut|Moyen|Bas)"',
                          r'/ 10 sec', r'10 étapes', r'pv-sim', r"'rentabilite'", r"'budget'(?!,\s*where)"] if re.search(p, s)]
    if restes:
        raise Echec('restes : ' + ', '.join(restes))
    return s, log

def main(argv):
    out = None
    if '--out' in argv:
        i = argv.index('--out'); out = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    failed = 0
    for f in argv:
        src = open(f, encoding='utf-8').read()
        try:
            res, log = clean(src)
        except Echec as e:
            failed += 1
            print('ECHEC', f, '—', e)
            continue
        dest = os.path.join(out, os.path.basename(f)) if out else f
        open(dest, 'w', encoding='utf-8').write(res)
        print('OK', f, '(%d → %d octets)' % (len(src.encode()), len(res.encode())))
    return 1 if failed else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
