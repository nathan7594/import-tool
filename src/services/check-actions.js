// services/check-actions.js
// Applique les actions de STOCK suite à un check PFS.
//
// Règle (validée avec Taxna) :
//   - couleur en rupture / stock < 5 chez PFS      -> 0 par taille (toutes tailles de la couleur)
//   - couleur dispo (>= 5) chez PFS                -> 3 par taille
//   - on ne touche JAMAIS au statut du produit (pas de brouillon) : un produit
//     tout en rupture reste publié, affiché "épuisé".
//
// Mapping couleur : PFS (WHITE, BURGUNDY...) -> palette Shopify (BLANC, ROUGE...)
// via normaliserCouleur (réutilisée depuis shopify.js). Plusieurs couleurs PFS
// peuvent mapper vers une seule couleur Shopify : on garde dispo si AU MOINS une
// source est dispo, on coupe seulement si TOUTES les sources sont en rupture.

import { shopifyGraphQL } from './shopify-auth.js';
import { normaliserCouleur } from './shopify.js';

const LOCATION_ID = process.env.SHOPIFY_LOCATION_ID || null;
const SEUIL_PIECE = 5;    // pièces : reste < 5 => on coupe
const SEUIL_PACK = 4;     // packs  : reste < 4 => on coupe
const STOCK_DISPO = 3;    // stock remis par taille quand la couleur est dispo
const STOCK_RUPTURE = 0;

// Garde-fou : si plus de ce ratio de variantes bascule vers 0 en un seul run,
// on suspecte une anomalie (session PFS coupée, parsing cassé) -> on n'applique RIEN.
const SEUIL_ALERTE = 0.5;      // ratio de mises à 0 au-delà duquel on s'inquiète
const MIN_PRODUITS_GARDEFOU = 20; // garde-fou actif seulement à partir de ce nb de produits vérifiés
                                  // (sur 3-4 produits de test, un ratio élevé est normal)

// ─────────────────────────────────────────────────────────────
// Détermine, pour un verdict de produit, le stock cible par couleur Shopify normalisée.
// Renvoie { BLANC: 3, ROUGE: 0, ... }
// ─────────────────────────────────────────────────────────────
function stockParCouleurShopify(verdict) {
  const cible = {}; // couleurShopify -> { dispo:bool }  (dispo = au moins une source OK)

  for (const v of verdict.variantes || []) {
    // une variante PFS est "coupée" si rupture OU (reste connu et sous le seuil).
    // Le seuil dépend du type : pièce (<5) ou pack (<4).
    const seuil = v.type === 'pack' ? SEUIL_PACK : SEUIL_PIECE;
    const coupee = v.etat === 'rupture' || (v.reste != null && v.reste < seuil);
    // NB : etat 'faible' sans reste connu -> on considère dispo (prudent, on coupe pas à l'aveugle)

    for (const refPFS of v.couleurs || []) {
      const norm = normaliserCouleur(null, refPFS); // ex: WHITE -> BLANC
      if (!norm) continue; // couleur non mappée -> on l'ignore (ne casse rien)
      if (!(norm in cible)) cible[norm] = { dispo: false };
      // dispo si AU MOINS une source de cette couleur Shopify n'est pas coupée
      if (!coupee) cible[norm].dispo = true;
    }
  }

  // Convertir en quantité : dispo -> 3, sinon -> 0
  const result = {};
  for (const [norm, s] of Object.entries(cible)) {
    result[norm] = s.dispo ? STOCK_DISPO : STOCK_RUPTURE;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Récupère les variantes Shopify d'un produit, groupées par couleur normalisée.
// Renvoie { BLANC: [{variantId, invItemId, qty}], ... }
// ─────────────────────────────────────────────────────────────
async function variantesParCouleur(productId) {
  const data = await shopifyGraphQL(`
    query($id: ID!) {
      product(id: $id) {
        handle
        featuredImage { url }
        pfsUrl: metafield(namespace: "custom", key: "pfs_url") { value }
        variants(first: 250) {
          edges {
            node {
              id
              inventoryQuantity
              inventoryItem { id }
              selectedOptions { name value }
            }
          }
        }
      }
    }
  `, { id: productId });

  const groupes = {};
  for (const { node } of data.product?.variants?.edges || []) {
    const opt = node.selectedOptions.find((o) => o.name === 'Couleur');
    if (!opt) continue;
    // La valeur d'option est déjà normalisée FR ("Blanc","Rouge"...) -> on met en MAJ
    const cle = opt.value.toUpperCase().trim();
    (groupes[cle] ||= []).push({
      variantId: node.id,
      invItemId: node.inventoryItem?.id,
      qty: node.inventoryQuantity,
    });
  }
  // méta du produit (image, liens) pour le journal
  const meta = {
    handle: data.product?.handle || null,
    image: data.product?.featuredImage?.url || null,
    pfsUrl: data.product?.pfsUrl?.value || null,
  };
  return { groupes, meta };
}

// ─────────────────────────────────────────────────────────────
// Applique le stock cible sur les variantes d'un produit.
// dryRun = true -> ne modifie rien, renvoie juste ce qui SERAIT fait.
// ─────────────────────────────────────────────────────────────
async function appliquerProduit(produit, dryRun) {
  const verdict = produit.verdict || {};
  if (verdict.erreur) return { titre: produit.titre, saute: true, raison: 'erreur fetch' };

  const cibleParCouleur = verdict.vivant ? stockParCouleurShopify(verdict) : null;
  const { groupes, meta } = await variantesParCouleur(produit.id);

  const changements = []; // { couleur, vers, nb, raison }
  const ajustements = []; // { invItemId, qty } à appliquer

  // Pour connaître la raison par couleur, on relit le verdict PFS
  function raisonCouleur(couleurShopify, cible) {
    if (!verdict.vivant) return 'produit retiré de PFS';
    if (cible === 0) return 'rupture ou stock < 5 chez PFS';
    return 'de nouveau disponible chez PFS';
  }

  for (const [couleur, variantes] of Object.entries(groupes)) {
    let cible;
    if (!verdict.vivant) {
      cible = STOCK_RUPTURE;
    } else if (couleur in cibleParCouleur) {
      cible = cibleParCouleur[couleur];
    } else {
      continue; // couleur pas dans le verdict PFS -> on ne touche pas
    }

    for (const v of variantes) {
      if (v.qty !== cible && v.invItemId) {
        ajustements.push({ invItemId: v.invItemId, qty: cible });
      }
    }
    const nbChange = variantes.filter((v) => v.qty !== cible && v.invItemId).length;
    if (nbChange > 0) {
      changements.push({ couleur, vers: cible, nb: nbChange, raison: raisonCouleur(couleur, cible) });
    }
  }

  // niveau de gravité pour l'affichage : vert / orange / rouge
  const nbCoupees = changements.filter((c) => c.vers === 0).length;
  const nbCouleursTotal = Object.keys(groupes).length;
  let niveau = 'vert'; // rien enlevé
  if (!verdict.vivant || (nbCoupees > 0 && nbCoupees >= nbCouleursTotal)) niveau = 'rouge'; // tout coupé / mort
  else if (nbCoupees > 0) niveau = 'orange'; // partiellement coupé

  const base = {
    titre: produit.titre,
    changements,
    nbAjustements: ajustements.length,
    niveau,
    image: meta.image,
    handle: meta.handle,
    pfsUrl: meta.pfsUrl || produit.pfsUrl,
    vivant: verdict.vivant,
  };

  if (dryRun) return { ...base, dryRun: true };

  // Appliquer réellement
  for (const a of ajustements) {
    await shopifyGraphQL(`
      mutation set($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors { field message }
        }
      }
    `, {
      input: {
        name: 'available',
        reason: 'correction',
        ignoreCompareQuantity: true,
        quantities: [{ inventoryItemId: a.invItemId, locationId: LOCATION_ID, quantity: a.qty }],
      },
    });
  }

  return base;
}

// ─────────────────────────────────────────────────────────────
// Point d'entrée : applique les actions sur toute une liste de résultats.
// dryRun = true par défaut (sécurité) -> ne modifie rien, montre ce qui serait fait.
// ─────────────────────────────────────────────────────────────
export async function appliquerActions(resultats, { dryRun = true } = {}) {
  if (!LOCATION_ID) {
    return { ok: false, erreur: 'SHOPIFY_LOCATION_ID manquant dans .env' };
  }

  // Garde-fou global : estimer combien de variantes basculeraient vers 0
  // (on fait un premier passage dryRun pour compter, même si on applique ensuite)
  const rapports = [];
  let totalVariantes = 0;
  let totalVersZero = 0;

  for (const p of resultats) {
    const r = await appliquerProduit(p, true); // dryRun pour compter
    if (r.changements) {
      for (const c of r.changements) {
        totalVariantes += c.nb;
        if (c.vers === 0) totalVersZero += c.nb;
      }
    }
  }

  const ratio = totalVariantes > 0 ? totalVersZero / totalVariantes : 0;
  // Le garde-fou ne s'active que si on vérifie ASSEZ de produits (sinon un lot de
  // test avec beaucoup de ruptures déclencherait une fausse alerte).
  const alerte = resultats.length >= MIN_PRODUITS_GARDEFOU && ratio > SEUIL_ALERTE && totalVersZero > 10;

  if (alerte && !dryRun) {
    return {
      ok: false,
      alerte: true,
      message: `GARDE-FOU : ${totalVersZero} variantes passeraient à 0 (${Math.round(ratio*100)}% des changements). Anormal -> rien appliqué. Vérifie la session PFS.`,
    };
  }

  // Application réelle (ou dryRun final)
  for (const p of resultats) {
    const r = await appliquerProduit(p, dryRun);
    rapports.push(r);
    // log console
    if (r.changements && r.changements.length) {
      const detail = r.changements.map((c) => `${c.couleur}=${c.vers} (${c.nb} tailles)`).join(', ');
      console.log(`   ${dryRun ? '[SIMU]' : '[APPLIQUÉ]'} ${r.titre} → ${detail}`);
    } else if (!r.saute) {
      console.log(`   [OK] ${r.titre} → rien à changer`);
    }
  }

  return { ok: true, dryRun, alerte, totalVariantes, totalVersZero, rapports };
}