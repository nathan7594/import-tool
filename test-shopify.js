// test-shopify.js
// Teste la connexion Shopify : recupere un token, puis lit le nom de la boutique
// et la liste des collections (pour le futur menu deroulant).
//
// Usage : node test-shopify.js

import 'dotenv/config';
import { getToken, shopifyGraphQL } from './src/services/shopify-auth.js';

console.log('\n  Test connexion Shopify');
console.log('  Boutique :', process.env.SHOPIFY_STORE);

try {
  // 1. Token
  console.log('\n  1. Récupération du token...');
  const token = await getToken();
  console.log('     ✅ Token obtenu : ' + token.slice(0, 12) + '...');

  // 2. Infos boutique
  console.log('\n  2. Lecture des infos boutique...');
  const shop = await shopifyGraphQL(`{ shop { name primaryDomain { url } } }`);
  console.log('     ✅ Boutique :', shop.shop.name, '—', shop.shop.primaryDomain.url);

  // 3. Collections (pour le menu déroulant futur)
  console.log('\n  3. Lecture des collections...');
  const cols = await shopifyGraphQL(`{
    collections(first: 50) {
      edges { node { id title handle } }
    }
  }`);
  const liste = cols.collections.edges.map((e) => e.node);
  console.log(`     ✅ ${liste.length} collections trouvées :`);
  liste.forEach((c) => console.log(`        - ${c.title}  (handle: ${c.handle})`));

  console.log('\n  ✅ Connexion Shopify OK ! On peut créer des produits.\n');
} catch (err) {
  console.error('\n  ❌ Erreur :', err.message, '\n');
  process.exit(1);
}
