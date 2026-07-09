// services/commandes-service.js
// Lit les commandes Shopify et les prépare pour la page "commandes fournisseurs".
//
// Logique :
//   - on lit les commandes récentes (chaque ligne = une pièce vendue)
//   - chaque pièce a un identifiant UNIQUE = orderName + lineItemId (pour l'état acheté/pas)
//   - on regroupe par FOURNISSEUR (vendor) puis par RÉFÉRENCE (metafield custom.reference)
//   - pour chaque référence, on liste les variantes vendues (couleur/taille) avec quantité
//
// L'état "acheté" est stocké à part (voir commandes-etat.js), on le fusionne ici.

import { shopifyGraphQL } from './shopify-auth.js';
import { lireEtats } from './commandes-etat.js';

// Récupère toutes les lignes de commande récentes, à plat
async function lireLignesCommandes(nbCommandes = 100) {
  const lignes = [];
  let cursor = null;
  let encore = true;
  let pages = 0;

  while (encore && pages < 5) {
    const data = await shopifyGraphQL(`
      query($cursor: String) {
        orders(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              name
              createdAt
              lineItems(first: 100) {
                edges {
                  node {
                    id
                    title
                    quantity
                    variantTitle
                    variant {
                      product {
                        vendor
                        featuredImage { url }
                        reference: metafield(namespace: "custom", key: "reference") { value }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, { cursor });

    for (const { node: order } of data.orders?.edges || []) {
      for (const { node: li } of order.lineItems?.edges || []) {
        const p = li.variant?.product || {};
        lignes.push({
          // identifiant unique de cette vente précise
          id: `${order.name}::${li.id}`,
          orderName: order.name,
          date: order.createdAt,
          titre: li.title,
          variante: li.variantTitle || '',
          quantite: li.quantity || 1,
          fournisseur: p.vendor || 'Fournisseur inconnu',
          reference: p.reference?.value || '—',
          image: p.featuredImage?.url || null,
        });
      }
    }

    encore = data.orders?.pageInfo?.hasNextPage;
    cursor = data.orders?.pageInfo?.endCursor;
    pages++;
  }

  return lignes;
}

// Regroupe les lignes par fournisseur -> référence -> variantes
// separe selon l'état (acheté ou non)
export async function getCommandesGroupees() {
  const lignes = await lireLignesCommandes();
  const etats = await lireEtats(); // { "id": true } => acheté

  // structure : { fournisseur: { ref: { titre, image, reference, variantes: {..}, lignes:[] } } }
  function grouper(sousEnsemble) {
    const parFournisseur = {};
    for (const l of sousEnsemble) {
      parFournisseur[l.fournisseur] ||= {};
      const refs = parFournisseur[l.fournisseur];
      refs[l.reference] ||= {
        reference: l.reference,
        titre: l.titre,
        image: l.image,
        variantes: {}, // "Bleu / 46" -> quantité cumulée
        ids: [],       // ids des ventes couvertes (pour cocher/décocher)
      };
      const entree = refs[l.reference];
      entree.variantes[l.variante] = (entree.variantes[l.variante] || 0) + l.quantite;
      entree.ids.push(l.id);
      // garde une image si pas encore
      if (!entree.image && l.image) entree.image = l.image;
    }
    return parFournisseur;
  }

  const aAcheter = lignes.filter((l) => !etats[l.id]);
  const dejaAchete = lignes.filter((l) => etats[l.id]);

  return {
    aAcheter: grouper(aAcheter),
    dejaAchete: grouper(dejaAchete),
  };
}