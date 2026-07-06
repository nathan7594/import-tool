// test-creer-produit.js
// Cree un VRAI produit de test (brouillon) sur mescopines, avec pastilles couleur + tailles liees.
// Usage : node test-creer-produit.js

import 'dotenv/config';
import { creerProduit, deduireTag } from './src/services/shopify.js';

console.log('\n  Test création produit Shopify (pastilles + tailles liées)');

const tag = deduireTag('Tuniques');
console.log('  Tag déduit pour "Tuniques" :', tag);

try {
  const produit = await creerProduit({
    titre: '[TEST] Tunique col bardot broderie anglaise',
    couleurs: [
      { label: 'Blanc', hex: '#FFFFFF' },
      { label: 'Noir', hex: '#2D2C2F' },
      { label: 'Marine', hex: '#263056' },  // sera normalisé en Bleu
      { label: 'Orange', hex: '#FF6B35' },
    ],
    tailles: [46, 48, 50, 52, 54],
    prix: 24.90,
    tag,
    description: '<p>Tunique longue en coton léger, col bardot, broderie anglaise. Coupe ample et confortable, idéale grande taille.</p>',
    store: process.env.SHOPIFY_STORE,
  });

  console.log('\n  ✅ Produit créé en BROUILLON avec pastilles !');
  console.log('     Titre     :', produit.titre);
  console.log('     Couleurs  :', produit.couleurs.join(', '), '(normalisées)');
  console.log('     Tailles   :', produit.tailles.join(', '));
  console.log('     Variantes :', produit.nbVariantes);
  console.log('     Voir      :', produit.adminUrl);
  console.log('\n  → Va voir le produit : les couleurs doivent avoir leur PASTILLE.');
  console.log('  → Marine doit apparaître en "Bleu" (normalisation).\n');
} catch (err) {
  console.error('\n  ❌ Erreur :', err.message, '\n');
  process.exit(1);
}