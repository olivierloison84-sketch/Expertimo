#!/usr/bin/env python3
"""Génère data/revenus-communes.json depuis Insee Filosofi 2021 (fichiers COM + ARR).
Usage : python3 scripts/build-revenus-insee.py <dossier cc_filosofi_2021_*.csv>
Clé = code INSEE ; valeur = [ménages fiscaux, niveau de vie médian (€/an/UC), 1er décile, 9e décile]."""
import csv, json, sys, os
d = sys.argv[1]
out = {}
def num(s):
    s = (s or '').strip().replace(',', '.')
    try: return float(s)
    except ValueError: return None
for f in ('cc_filosofi_2021_COM.csv', 'cc_filosofi_2021_ARR.csv'):
    with open(os.path.join(d, f), encoding='utf-8-sig', newline='') as fh:
        for r in csv.DictReader(fh, delimiter=';'):
            nb, med, d1, d9 = num(r['NBMENFISC21']), num(r['MED21']), num(r['D121']), num(r['D921'])
            if nb and med and d1 and d9 and d9 > d1:
                out[r['CODGEO']] = [round(nb), round(med), round(d1), round(d9)]
with open(os.path.join(os.path.dirname(__file__), '..', 'data', 'revenus-communes.json'), 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
print(len(out), 'communes')
