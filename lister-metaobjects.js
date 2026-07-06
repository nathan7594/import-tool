// lister-metaobjects.js
// Liste tous les metaobjects de la boutique (couleurs, tailles, etc.) avec leurs IDs.
// On en a besoin pour lier les pastilles couleur et les tailles aux produits.
//
// Usage : node lister-metaobjects.js

import 'dotenv/config';
import { shopifyGraphQL } from './src/services/shopify-auth.js';

console.log('\n  Liste des metaobjects de la boutique\n');

// 1. D'abord : quelles "définitions" de metaobjects existent ?
const defs = await shopifyGraphQL(`{
  metaobjectDefinitions(first: 30) {
    edges { node { id name type } }
  }
}`);

const definitions = defs.metaobjectDefinitions.edges.map((e) => e.node);
console.log('  Définitions trouvées :');
definitions.forEach((d) => console.log(`    - ${d.name}  (type: ${d.type})`));
console.log('');

// 2. Pour chaque définition, lister ses entrées (les valeurs)
for (const def of definitions) {
  const entrees = await shopifyGraphQL(`
    query($type: String!) {
      metaobjects(type: $type, first: 50) {
        edges { node { id displayName fields { key value } } }
      }
    }
  `, { type: def.type });

  const items = entrees.metaobjects.edges.map((e) => e.node);
  if (items.length === 0) continue;

  console.log(`  ━━ ${def.name} (${def.type}) ━━`);
  items.forEach((m) => {
    const idCourt = m.id.split('/').pop();
    console.log(`     "${m.displayName}"  →  ${m.id}`);
  });
  console.log('');
}

console.log('  ✅ Terminé. Copie/colle-moi cette liste.\n');
