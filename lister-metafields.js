// lister-metafields.js
// Liste TOUS les metafields + metaobjects d'un produit Shopify.
// Permet de voir quels champs le thème FullStack utilise (description, bénéfices, accordéons...).
//
// Usage : node lister-metafields.js 15629513654598
//   (le numéro = l'ID du produit, visible dans l'URL admin)

import 'dotenv/config';
import { shopifyGraphQL } from './src/services/shopify-auth.js';

const idProduit = process.argv[2];
if (!idProduit) {
  console.error('\n  Usage : node lister-metafields.js <ID_PRODUIT>');
  console.error('  (le numéro à la fin de l\'URL admin du produit)\n');
  process.exit(1);
}

const gid = `gid://shopify/Product/${idProduit}`;

console.log('\n  Lecture des metafields du produit', idProduit, '...\n');

try {
  const data = await shopifyGraphQL(`
    query($id: ID!) {
      product(id: $id) {
        title
        descriptionHtml
        metafields(first: 50) {
          edges {
            node {
              namespace
              key
              type
              value
            }
          }
        }
      }
    }
  `, { id: gid });

  const p = data.product;
  if (!p) {
    console.error('  Produit introuvable.\n');
    process.exit(1);
  }

  console.log('  ───────────────────────────────────────────');
  console.log('  TITRE :', p.title);
  console.log('  ───────────────────────────────────────────');
  console.log('  DESCRIPTION (champ standard) :');
  console.log('  ', p.descriptionHtml ? p.descriptionHtml.slice(0, 200) : '(VIDE)');
  console.log('  ───────────────────────────────────────────\n');

  const metas = p.metafields.edges.map((e) => e.node);
  if (metas.length === 0) {
    console.log('  Aucun metafield personnalisé sur ce produit.\n');
  } else {
    console.log(`  METAFIELDS (${metas.length}) :\n`);
    for (const m of metas) {
      console.log(`  ▸ ${m.namespace}.${m.key}`);
      console.log(`     type  : ${m.type}`);
      const val = (m.value || '').slice(0, 150);
      console.log(`     valeur: ${val || '(vide)'}`);
      console.log('');
    }
  }
  console.log('  ───────────────────────────────────────────\n');
} catch (err) {
  console.error('  ❌ Erreur :', err.message, '\n');
  process.exit(1);
}