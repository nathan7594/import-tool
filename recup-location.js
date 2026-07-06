// recup-location.js — recupere le Location ID (emplacement de stock) de la boutique
import 'dotenv/config';
import { shopifyGraphQL } from './src/services/shopify-auth.js';

const data = await shopifyGraphQL(`{
  locations(first: 5) {
    edges { node { id name isActive } }
  }
}`);

console.log('\n  Emplacements (locations) de la boutique :\n');
data.locations.edges.forEach((e) => {
  console.log(`     ${e.node.name}  ${e.node.isActive ? '(actif)' : '(inactif)'}`);
  console.log(`     → ${e.node.id}\n`);
});