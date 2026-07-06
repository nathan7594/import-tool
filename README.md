# Import-Tool — Backend (squelette)

Backend orchestrateur. Recoit un produit depuis l'extension Chrome, et (a terme)
genere les images, deplie les tailles, redige la description SEO et cree le produit Shopify.

## Etat actuel
SQUELETTE FONCTIONNEL : le serveur tourne, recoit le paquet de la modale,
valide les donnees et deplie les tailles. Les briques images / SEO / Shopify
seront branchees une par une.

## Lancer en local
```bash
cd backend
npm install
cp .env.example .env      # puis remplir les cles plus tard
npm start
```

Le serveur ecoute sur http://localhost:3000

## Tester
```bash
# Verifier que ca tourne
curl http://localhost:3000/ping

# Simuler un import (comme le fera la modale)
curl -X POST http://localhost:3000/import-produit \
  -H "Content-Type: application/json" \
  -d '{"titre":"Robe test","imageSource":"https://x.com/a.jpg","couleurs":["Rose","Noir"],"tailleMin":46,"tailleMax":70,"prixVente":24}'
```

## Structure
```
backend/
├── src/
│   ├── server.js          Point d'entree (Express)
│   ├── routes/import.js    Route /import-produit (recoit + valide + deplie tailles)
│   ├── services/           [a venir] images.js, seo.js, shopify.js
│   └── utils/tailles.js    Deplie une plage 46->70 en 46,48,...,70
├── .env.example
└── package.json
```

## Prochaines briques (dans l'ordre)
1. services/images.js   → Nano Banana : 4 images par couleur, fond beige, sans logo
2. services/seo.js      → Claude : description SEO
3. services/shopify.js  → GraphQL : produit en brouillon avec variantes Couleur x Taille
