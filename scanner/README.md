# Kamadvice — Scanner (Python)

Le scanner est un **adaptateur de collecte de prix**. Il ne contient
aucune logique métier (coût de craft, marge, rentabilité) : cette
logique vit dans le backend. Le scanner sait seulement :

1. demander au backend quelles ressources/objets scanner (une
   `ScanSession` en attente) ;
2. rechercher chacun d'eux dans l'HDV du client Dofus ouvert
   localement ;
3. lire le(s) prix affiché(s) (par lot x1/x10/x100 quand disponible) ;
4. renvoyer les observations au backend, avec un statut d'erreur si la
   cible n'a pas été trouvée.

Ce découplage permet de remplacer le scanner (ex: par un appel à une
future API officielle) sans changer le reste de l'application.

## État actuel

Ce dossier ne contient encore qu'un squelette : pas d'automatisation
du jeu pour l'instant. Le contrat HTTP avec le backend
(`GET /api/scan-sessions/{id}/pending`,
`POST /api/scan-sessions/{id}/observations`) sera implémenté une fois
le backend minimal exposé.

## Développement local

```bash
cd scanner
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```
