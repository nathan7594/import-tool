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
import { lireSuivi } from './suivi-service.js';

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

// ─────────────────────────────────────────────────────────────
// Version enrichie avec le SUIVI (statut, ruptures par couleur, notes).
// Regroupe par fournisseur -> référence -> variantes cumulées, et rattache
// l'état de suivi de chaque référence (la couleur "Jaune / 46" -> couleur "Jaune").
// ─────────────────────────────────────────────────────────────
export async function getCommandesAvecSuivi() {
  const lignes = await lireLignesCommandes();
  const suivi = await lireSuivi(); // { vente_id: { statut, couleurs_rupture, note } }

  // Regroupe toutes les ventes par fournisseur -> référence
  const parFournisseur = {};
  for (const l of lignes) {
    parFournisseur[l.fournisseur] ||= {};
    const refs = parFournisseur[l.fournisseur];
    refs[l.reference] ||= {
      reference: l.reference,
      titre: l.titre,
      image: l.image,
      variantes: {},   // "Jaune / 46" -> quantité
      couleurs: new Set(), // couleurs distinctes (pour le statut par couleur)
      ids: [],         // toutes les ventes de cette référence
      totalPieces: 0,
    };
    const e = refs[l.reference];
    e.variantes[l.variante] = (e.variantes[l.variante] || 0) + l.quantite;
    e.ids.push(l.id);
    e.totalPieces += l.quantite;
    if (!e.image && l.image) e.image = l.image;
    // extraire la couleur depuis "Jaune / 46" -> "Jaune"
    const couleur = (l.variante || '').split('/')[0].trim();
    if (couleur) e.couleurs.add(couleur);
  }

  // Rattacher le suivi à chaque référence
  // Le statut d'une référence = celui de ses ventes (on prend le plus "avancé" commun,
  // sinon a_commander par défaut). Les ruptures = union des couleurs en rupture.
  for (const refs of Object.values(parFournisseur)) {
    for (const e of Object.values(refs)) {
      let statut = 'a_commander';
      const rupture = new Set();
      let note = '';
      for (const id of e.ids) {
        const s = suivi[id];
        if (s) {
          if (s.statut && s.statut !== 'a_commander') statut = s.statut;
          for (const c of s.couleurs_rupture || []) rupture.add(c);
          if (s.note) note = s.note;
        }
      }
      e.statut = statut;
      e.couleurs = [...e.couleurs];           // Set -> array
      e.couleursRupture = [...rupture];
      e.note = note;
    }
  }

  return parFournisseur;
}