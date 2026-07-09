// services/shopify.js
// Cree un produit sur Shopify (BROUILLON) avec :
//  - variantes Couleur x Taille
//  - pastilles couleur (metaobject color-pattern liee a l'option Couleur)
//  - tailles liees au metaobject size
//  - metafields age-group (Adultes) + target-gender (Feminin)
//  - tag de collection (tunique/robe/top/pantalon)
//
// IDs des metaobjects = ceux de la boutique mescopines (zu5qny-mj).

import { shopifyGraphQL } from './shopify-auth.js';
import sharp from 'sharp';

// ─── IDs metaobjects COULEUR (mescopines) ───
const COULEURS_METAOBJECT_IDS = {
  BLEU: 'gid://shopify/Metaobject/470478520646',
  BRONZE: 'gid://shopify/Metaobject/470478553414',
  GRIS: 'gid://shopify/Metaobject/470478586182',
  JAUNE: 'gid://shopify/Metaobject/470481764678',
  VIOLET: 'gid://shopify/Metaobject/470501785926',
  ROUGE: 'gid://shopify/Metaobject/482378809670',
  NOIR: 'gid://shopify/Metaobject/488219771206',
  BLANC: 'gid://shopify/Metaobject/551875674438',
  BEIGE: 'gid://shopify/Metaobject/551875838278',
  VERT: 'gid://shopify/Metaobject/551876526406',
  ORANGE: 'gid://shopify/Metaobject/551876624710',
  ROSE: 'gid://shopify/Metaobject/551876657478',
  MARRON: 'gid://shopify/Metaobject/551876723014',
};

// ─── IDs metaobjects TAILLE (mescopines) ───
const TAILLES_METAOBJECT_IDS = {
  '44': 'gid://shopify/Metaobject/470481797446',
  '46': 'gid://shopify/Metaobject/470481830214',
  '48': 'gid://shopify/Metaobject/470481862982',
  '50': 'gid://shopify/Metaobject/470481895750',
  '52': 'gid://shopify/Metaobject/470481928518',
  '54': 'gid://shopify/Metaobject/470481961286',
  '56': 'gid://shopify/Metaobject/470481994054',
  '58': 'gid://shopify/Metaobject/470482026822',
  '60': 'gid://shopify/Metaobject/470482059590',
  '62': 'gid://shopify/Metaobject/470503162182',
  '64': 'gid://shopify/Metaobject/470503489862',
  '66': 'gid://shopify/Metaobject/470503850310',
  '68': 'gid://shopify/Metaobject/470503883078',
  '70': 'gid://shopify/Metaobject/470503915846',
};

// ─── Metaobjects fixes ───
const AGE_GROUP_ADULTES = 'gid://shopify/Metaobject/470501982534';
const TARGET_GENDER_FEMININ = 'gid://shopify/Metaobject/470501916998';

// Emplacement de stock (mescopines) — lu depuis .env
const LOCATION_ID = process.env.SHOPIFY_LOCATION_ID || null;
// Canal "Boutique en ligne" (pour publier le produit) — lu depuis .env
const ONLINE_STORE_PUB_ID = process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID || null;
// ─── Normalisation des couleurs PFS -> palette mescopines ───
// Priorite au colorReference PFS (anglais, fiable : BLAZING_YELLOW, SKY_BLUE...).
// Le label FR ("Jaune Citron") sert de secours.
export function normaliserCouleur(label, reference) {
  // 1. D'abord essayer le colorReference PFS (code anglais)
  if (reference) {
    const r = reference.toUpperCase();
    // Mots couleur anglais contenus dans le code PFS
    const mapEN = [
      [['BLUE', 'NAVY', 'TURQUOISE', 'PETROL', 'TEAL', 'DENIM', 'JEAN'], 'BLEU'],
      [['BLACK'], 'NOIR'],
      [['WHITE', 'IVORY', 'OFF_WHITE'], 'BLANC'],
      [['GREEN', 'KHAKI', 'KAKI', 'OLIVE', 'MINT', 'EMERALD', 'WASABI', 'AMAZON', 'LIME'], 'VERT'],
      [['PINK', 'FUCHSIA', 'ROSE', 'SALMON', 'MAGENTA', 'BLUSH'], 'ROSE'],
      [['BEIGE', 'CREAM', 'NUDE', 'SAND', 'TAUPE', 'ECRU', 'CAMEL', 'VANILLA'], 'BEIGE'],
      [['BROWN', 'CHOCOLATE', 'COGNAC', 'MOCHA', 'BRUN', 'MARRON'], 'MARRON'],
      [['RED', 'BORDEAUX', 'BURGUNDY', 'WINE', 'CORAL'], 'ROUGE'],
      [['YELLOW', 'MUSTARD', 'GOLD', 'LEMON', 'FREESIA'], 'JAUNE'],
      [['ORANGE', 'APRICOT', 'PEACH', 'TERRACOTTA', 'RUST'], 'ORANGE'],
      [['GRAY', 'GREY', 'ANTHRACITE', 'SILVER'], 'GRIS'],
      [['PURPLE', 'VIOLET', 'LILAC', 'LAVENDER', 'PLUM', 'MAUVE'], 'VIOLET'],
      [['BRONZE'], 'BRONZE'],
    ];
    for (const [mots, cible] of mapEN) {
      if (mots.some((m) => r.includes(m))) {
        return COULEURS_METAOBJECT_IDS[cible] ? cible : null;
      }
    }
  }

  // 2. Secours : le label francais
  if (!label) return null;
  const c = label.toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const regles = [
    [['MARINE', 'PETROLE', 'TURQUOISE', 'JEAN', 'DENIM', 'CANARD'], 'BLEU'],
    [['TAUPE', 'CREME', 'ECRU', 'SABLE', 'NUDE', 'CAMEL'], 'BEIGE'],
    [['KAKI', 'OLIVE', 'SAPIN', 'MENTHE', 'EMERAUDE'], 'VERT'],
    [['BORDEAUX', 'BRIQUE', 'BRIQUE', 'VIN'], 'ROUGE'],
    [['MOUTARDE', 'DORE', 'CITRON'], 'JAUNE'],
    [['CORAIL', 'SAUMON', 'ABRICOT', 'PECHE'], 'ORANGE'],
    [['FUCHSIA', 'FRAMBOISE', 'MAGENTA', 'BLUSH', 'POUDRE', 'DRAGEE', 'VIEUX ROSE'], 'ROSE'],
    [['ANTHRACITE', 'ARGENT'], 'GRIS'],
    [['CHOCOLAT', 'COGNAC', 'MOKA', 'NOISETTE', 'BRUN'], 'MARRON'],
    [['LAVANDE', 'LILAS', 'PRUNE', 'MAUVE', 'PARME'], 'VIOLET'],
  ];
  for (const [mots, cible] of regles) {
    if (mots.some((m) => c.includes(m))) {
      return COULEURS_METAOBJECT_IDS[cible] ? cible : null;
    }
  }
  if (c.split(/[\s-]+/).includes('OR')) return COULEURS_METAOBJECT_IDS['JAUNE'] ? 'JAUNE' : null;

  const couleursBase = ['BLANC', 'NOIR', 'ROUGE', 'ORANGE', 'JAUNE', 'VERT', 'BLEU',
    'VIOLET', 'ROSE', 'GRIS', 'BEIGE', 'MARRON', 'BRONZE'];
  for (const base of couleursBase) {
    if (c.includes(base)) {
      return COULEURS_METAOBJECT_IDS[base] ? base : null;
    }
  }
  return null;
}

// ─── Categories taxonomy Shopify (debloque les metafields couleur/taille) ───
const CATEGORIES_TAXONOMY = {
  tuniques: 'gid://shopify/TaxonomyCategory/aa-1-13-11',
  robes: 'gid://shopify/TaxonomyCategory/aa-1-4',
  combinaisons: 'gid://shopify/TaxonomyCategory/aa-1-6',
  tops: 'gid://shopify/TaxonomyCategory/aa-1-13',
  tshirts: 'gid://shopify/TaxonomyCategory/aa-1-13-8',
  debardeurs: 'gid://shopify/TaxonomyCategory/aa-1-13-7',
  blouses: 'gid://shopify/TaxonomyCategory/aa-1-13',
  chemises: 'gid://shopify/TaxonomyCategory/aa-1-13-3',
  pulls: 'gid://shopify/TaxonomyCategory/aa-1-13-6',
  gilets: 'gid://shopify/TaxonomyCategory/aa-1-13-2',
  ponchos: 'gid://shopify/TaxonomyCategory/aa-1-13',
  pantalons: 'gid://shopify/TaxonomyCategory/aa-1-12',
  jeans: 'gid://shopify/TaxonomyCategory/aa-1-12-4',
  leggings: 'gid://shopify/TaxonomyCategory/aa-1-12-5',
  pantacourts: 'gid://shopify/TaxonomyCategory/aa-1-12',
  jupes: 'gid://shopify/TaxonomyCategory/aa-1-11',
  shorts: 'gid://shopify/TaxonomyCategory/aa-1-10',
  ensembles: 'gid://shopify/TaxonomyCategory/aa-1',
};
const CATEGORIE_DEFAUT = 'gid://shopify/TaxonomyCategory/aa-1'; // Vêtements

// ─── CATÉGORIES : table complète (ordre = spécifique AVANT générique) ───
// tag  = minuscule, pluriel, sans accent (pour les collections Shopify)
// type = singulier, majuscule, avec accent (pour le champ Type / filtre)
// mots = mots-clés cherchés dans le titre/catégorie PFS pour détecter + pré-cocher
export const CATEGORIES = [
  // ROBES & CO (spécifiques d'abord)
  { tag: 'combinaisons', type: 'Combinaison', groupe: 'ROBES & CO', mots: ['combinaison', 'combishort', 'combi'] },
  { tag: 'ensembles', type: 'Ensemble', groupe: 'ROBES & CO', mots: ['ensemble', '2 pieces', '2 pièces', 'deux pieces', 'deux pièces', 'set'] },
  { tag: 'robes', type: 'Robe', groupe: 'ROBES & CO', mots: ['robe', 'caftan', 'kaftan'] },
  // BAS (spécifiques d'abord : jean, pantacourt, legging avant pantalon)
  { tag: 'jeans', type: 'Jean', groupe: 'BAS', mots: ['jean', 'denim'] },
  { tag: 'pantacourts', type: 'Pantacourt', groupe: 'BAS', mots: ['pantacourt', 'capri', 'corsaire', '7/8'] },
  { tag: 'leggings', type: 'Legging', groupe: 'BAS', mots: ['legging', 'jegging'] },
  { tag: 'jupes', type: 'Jupe', groupe: 'BAS', mots: ['jupe'] },
  { tag: 'shorts', type: 'Short', groupe: 'BAS', mots: ['short'] },
  { tag: 'pantalons', type: 'Pantalon', groupe: 'BAS', mots: ['pantalon', 'pantaon'] },
  // HAUTS (spécifiques d'abord : débardeur, chemisier, t-shirt avant top/haut)
  { tag: 'ponchos', type: 'Poncho', groupe: 'HAUTS', mots: ['poncho', 'cape'] },
  { tag: 'debardeurs', type: 'Débardeur', groupe: 'HAUTS', mots: ['debardeur', 'débardeur', 'caraco', 'marcel', 'camisole'] },
  { tag: 'tshirts', type: 'T-shirt', groupe: 'HAUTS', mots: ['t-shirt', 'tshirt', 'tee-shirt', 't shirt', 'tee shirt'] },
  { tag: 'chemises', type: 'Chemise', groupe: 'HAUTS', mots: ['chemise', 'chemisier'] },
  { tag: 'blouses', type: 'Blouse', groupe: 'HAUTS', mots: ['blouse'] },
  { tag: 'tuniques', type: 'Tunique', groupe: 'HAUTS', mots: ['tunique'] },
  { tag: 'gilets', type: 'Gilet', groupe: 'HAUTS', mots: ['gilet', 'cardigan'] },
  { tag: 'pulls', type: 'Pull', groupe: 'HAUTS', mots: ['pull', 'sweat', 'sweatshirt', 'maille'] },
  { tag: 'tops', type: 'Top', groupe: 'HAUTS', mots: ['top', 'haut', 'marini', 'body', 'bustier', 'crop'] },
];

// Liste des hauts (pour autoriser la pose assise)
const TAGS_HAUTS = ['tops', 'tshirts', 'debardeurs', 'blouses', 'chemises', 'tuniques', 'pulls', 'gilets', 'ponchos'];

// ─── Deduit le tag principal depuis la categorie/titre (1er match dans l'ordre) ───
export function deduireTag(categorie) {
  const c = (categorie || '').toLowerCase();
  const found = CATEGORIES.find((cat) => cat.mots.some((m) => c.includes(m)));
  return found ? found.tag : null;
}

// ─── Deduit le Type (singulier, accent) depuis un tag ───
export function typeDepuisTag(tag) {
  const found = CATEGORIES.find((cat) => cat.tag === tag);
  return found ? found.type : null;
}

// ─── Est-ce un HAUT ? (pour autoriser la pose assise, qui couperait une robe/pantalon) ───
export function estUnHaut(categorie) {
  const tag = deduireTag(categorie);
  return tag ? TAGS_HAUTS.includes(tag) : false;
}

// ─── Creation du produit ───
// couleurs : [{label, hex}]  (chaque couleur sera une valeur d'option, normalisee)
// tailles  : [46,48,...]
export async function creerProduit({ titre, couleurs, tailles, prix, stock = 0, tag, tags = null, productType = null, description, metaDescription = null, altImages = null, atouts = null, compositionHtml = null, avis = null, videoFileId = null, fournisseur = null, reference = null, pfsUrl = null, statut = 'DRAFT', imagesParCouleur = null, store }) {
  // 1. Normaliser les couleurs et garder celles qui ont un metaobject
  const couleursNorm = [];
  for (const c of couleurs) {
    const norm = normaliserCouleur(c.label, c.reference);
    if (norm && !couleursNorm.find((x) => x.norm === norm)) {
      couleursNorm.push({ labelOriginal: c.label, reference: c.reference, norm, metaobjectId: COULEURS_METAOBJECT_IDS[norm] });
    } else if (!norm) {
      // Couleur non reconnue : on l'AVERTIT clairement (sinon variantes perdues en silence)
      console.log(`   [shopify] ⚠️ COULEUR NON RECONNUE : "${c.label}" (ref: ${c.reference || '?'}) → ignorée, AUCUNE variante créée pour cette couleur. Ajoute-la dans normaliserCouleur.`);
    }
  }
  if (couleursNorm.length === 0) {
    throw new Error('Aucune couleur reconnue parmi : ' + couleurs.map((c) => c.label).join(', '));
  }

  // 2. Tailles : garder celles qui ont un metaobject
  const taillesValides = tailles.map(String).filter((t) => TAILLES_METAOBJECT_IDS[t]);
  if (taillesValides.length === 0) throw new Error('Aucune taille valide.');

  // 3. Creer le produit avec sa CATEGORIE (obligatoire pour les metafields couleur/taille)
  const categorieTaxonomy = (tag && CATEGORIES_TAXONOMY[tag]) || CATEGORIE_DEFAUT;

  const dataCreate = await shopifyGraphQL(`
    mutation productCreate($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product { id }
        userErrors { field message }
      }
    }
  `, {
    product: {
      title: titre,
      descriptionHtml: description || '',
      productType: productType || (tag ? typeDepuisTag(tag) || (tag.charAt(0).toUpperCase() + tag.slice(1)) : 'Vêtement'),
      status: statut,
      category: categorieTaxonomy,
      vendor: fournisseur || undefined,   // fournisseur secret (visible admin, pas client)
      tags: (Array.isArray(tags) && tags.length > 0) ? tags : (tag ? [tag] : []),
    },
  });

  const errC = dataCreate.productCreate?.userErrors || [];
  if (errC.length) throw new Error('productCreate : ' + JSON.stringify(errC));
  const productGid = dataCreate.productCreate.product.id;
  const idNum = productGid.split('/').pop();

  // Pause pour laisser la categorie s'enregistrer avant de poser les metafields
  await new Promise((r) => setTimeout(r, 1500));

  // 4. Metafields : size (liste tailles) + color-pattern (liste couleurs) + age + gender
  const taillesIds = taillesValides.map((t) => TAILLES_METAOBJECT_IDS[t]);
  const couleursIds = couleursNorm.map((c) => c.metaobjectId);

  const dataMeta = await shopifyGraphQL(`
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key }
        userErrors { field message }
      }
    }
  `, {
    metafields: (() => {
      const champs = [
        { ownerId: productGid, namespace: 'shopify', key: 'size', value: JSON.stringify(taillesIds), type: 'list.metaobject_reference' },
        { ownerId: productGid, namespace: 'shopify', key: 'color-pattern', value: JSON.stringify(couleursIds), type: 'list.metaobject_reference' },
        { ownerId: productGid, namespace: 'shopify', key: 'age-group', value: JSON.stringify([AGE_GROUP_ADULTES]), type: 'list.metaobject_reference' },
        { ownerId: productGid, namespace: 'shopify', key: 'target-gender', value: JSON.stringify([TARGET_GENDER_FEMININ]), type: 'list.metaobject_reference' },
      ];
      // Meta-description (apparait dans Google) via le champ SEO natif
      if (metaDescription) {
        champs.push({ ownerId: productGid, namespace: 'global', key: 'description_tag', value: metaDescription, type: 'single_line_text_field' });
      }
      // Reference fournisseur (visible client) dans un metafield custom
      if (reference) {
        champs.push({ ownerId: productGid, namespace: 'custom', key: 'reference', value: String(reference), type: 'single_line_text_field' });
        // SKU = "NC" + référence (ex: NC2326), champ séparé
        champs.push({ ownerId: productGid, namespace: 'custom', key: 'sku', value: `NC${reference}`, type: 'single_line_text_field' });
      }
      // URL PFS d'origine + flag de surveillance (pour le check de disponibilité)
      if (pfsUrl) {
        champs.push({ ownerId: productGid, namespace: 'custom', key: 'pfs_url', value: String(pfsUrl), type: 'single_line_text_field' });
        champs.push({ ownerId: productGid, namespace: 'custom', key: 'check', value: 'on', type: 'single_line_text_field' });
      }
      // Atouts (façon Gymshark) : intro + 3 atouts dans des metafields custom
      if (atouts) {
        if (atouts.intro) champs.push({ ownerId: productGid, namespace: 'custom', key: 'atout_intro', value: String(atouts.intro), type: 'single_line_text_field' });
        if (atouts.a1) champs.push({ ownerId: productGid, namespace: 'custom', key: 'atout_1', value: String(atouts.a1), type: 'single_line_text_field' });
        if (atouts.a2) champs.push({ ownerId: productGid, namespace: 'custom', key: 'atout_2', value: String(atouts.a2), type: 'single_line_text_field' });
        if (atouts.a3) champs.push({ ownerId: productGid, namespace: 'custom', key: 'atout_3', value: String(atouts.a3), type: 'single_line_text_field' });
      }
      // Composition (phrase vendeuse + %) dans un metafield custom
      if (compositionHtml) {
        champs.push({ ownerId: productGid, namespace: 'custom', key: 'composition', value: String(compositionHtml), type: 'multi_line_text_field' });
      }
      // Vidéo (référence de fichier) dans le metafield custom.video
      if (videoFileId) {
        champs.push({ ownerId: productGid, namespace: 'custom', key: 'video', value: String(videoFileId), type: 'file_reference' });
      }
      // Avis client (nom + date + texte) dans des metafields custom
      if (avis) {
        if (avis.nom) champs.push({ ownerId: productGid, namespace: 'custom', key: 'avis_nom', value: String(avis.nom), type: 'single_line_text_field' });
        if (avis.date) champs.push({ ownerId: productGid, namespace: 'custom', key: 'avis_date', value: String(avis.date), type: 'single_line_text_field' });
        if (avis.texte) champs.push({ ownerId: productGid, namespace: 'custom', key: 'avis_texte', value: String(avis.texte), type: 'multi_line_text_field' });
      }
      return champs;
    })(),
  });

  const errM = dataMeta.metafieldsSet?.userErrors || [];
  if (errM.length) throw new Error('metafieldsSet : ' + JSON.stringify(errM));

  // Pause pour laisser Shopify enregistrer les metafields avant de creer les options liees
  await new Promise((r) => setTimeout(r, 1500));

  // 5. Creer les options Couleur + Taille LIEES aux metafields (= pastilles)
  const dataOptions = await shopifyGraphQL(`
    mutation productOptionsCreate($productId: ID!, $options: [OptionCreateInput!]!) {
      productOptionsCreate(productId: $productId, options: $options) {
        product { options { id name optionValues { id name linkedMetafieldValue } } }
        userErrors { field message }
      }
    }
  `, {
    productId: productGid,
    options: [
      { name: 'Couleur', linkedMetafield: { namespace: 'shopify', key: 'color-pattern' } },
      { name: 'Taille', linkedMetafield: { namespace: 'shopify', key: 'size' } },
    ],
  });

  const errO = dataOptions.productOptionsCreate?.userErrors || [];
  if (errO.length) throw new Error('productOptionsCreate : ' + JSON.stringify(errO));

  // Recuperer les IDs des valeurs d'options (pour lier les variantes)
  const options = dataOptions.productOptionsCreate.product.options;
  const couleurVals = {}; // norm -> optionValueId
  const tailleVals = {};  // "46" -> optionValueId
  for (const o of options) {
    if (o.name === 'Couleur') {
      o.optionValues.forEach((v) => {
        // v.linkedMetafieldValue = l'ID du metaobject ; on retrouve la couleur
        const found = couleursNorm.find((c) => c.metaobjectId === v.linkedMetafieldValue);
        if (found) couleurVals[found.norm] = v.id;
      });
    }
    if (o.name === 'Taille') {
      o.optionValues.forEach((v) => {
        const t = taillesValides.find((tt) => TAILLES_METAOBJECT_IDS[tt] === v.linkedMetafieldValue);
        if (t) tailleVals[t] = v.id;
      });
    }
  }

  // 6. Creer toutes les variantes Couleur x Taille
  const variantes = [];
  for (const c of couleursNorm) {
    for (const t of taillesValides) {
      const variante = {
        price: prix != null ? String(prix) : '0',
        optionValues: [
          couleurVals[c.norm] ? { optionName: 'Couleur', id: couleurVals[c.norm] } : { optionName: 'Couleur', name: c.norm },
          tailleVals[t] ? { optionName: 'Taille', id: tailleVals[t] } : { optionName: 'Taille', name: t },
        ],
      };
      // Stock : seulement si on a un LOCATION_ID
      if (LOCATION_ID && stock > 0) {
        variante.inventoryQuantities = [{ availableQuantity: stock, locationId: LOCATION_ID }];
      }
      variantes.push(variante);
    }
  }

  const dataVar = await shopifyGraphQL(`
    mutation bulk($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
      productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
        productVariants { id selectedOptions { name value } }
        userErrors { field message }
      }
    }
  `, { productId: productGid, variants: variantes, strategy: 'REMOVE_STANDALONE_VARIANT' });

  const errV = dataVar.productVariantsBulkCreate?.userErrors || [];
  if (errV.length) throw new Error('variantes : ' + JSON.stringify(errV));
  const variantesCreees = dataVar.productVariantsBulkCreate.productVariants;
  const nbVariantes = variantesCreees.length;

  // Regrouper les IDs de variantes par couleur (valeur de l'option Couleur, en MAJ pour matcher norm)
  const variantesParCouleur = {}; // "VERT" -> [variantId, ...]
  for (const v of variantesCreees) {
    const couleurOpt = v.selectedOptions.find((o) => o.name === 'Couleur');
    if (couleurOpt) {
      const cle = couleurOpt.value.toUpperCase().trim();
      (variantesParCouleur[cle] ||= []).push(v.id);
    }
  }

  // 7. Upload des images (associees a leur couleur via altText)
  // imagesParCouleur = { "Blanc": ["/chemin/face.png", ...] } — cle = label ORIGINAL
  let nbImages = 0;
  if (imagesParCouleur) {
    for (const [labelOriginal, cheminsBruts] of Object.entries(imagesParCouleur)) {
      const chemins = (cheminsBruts || []).filter(Boolean); // ignore les images échouées (undefined/null)
      const norm = normaliserCouleur(labelOriginal) || labelOriginal;
      if (chemins.length === 0) {
        console.log(`   [shopify] ${norm} : aucune image valide → pas d'upload`);
        continue;
      }
      console.log(`   [shopify] ${norm} : ${chemins.length} image(s) à uploader`);

      // 1. Uploader les images de cette couleur (avec retry)
      const medias = [];
      for (const cheminLocal of chemins) {
        let url = null;
        for (let essai = 1; essai <= 3 && !url; essai++) {
          url = await uploaderImage(cheminLocal);
          if (!url) {
            console.log(`   [shopify] ⚠️ upload raté (essai ${essai}/3) : ${cheminLocal}`);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        if (url) {
          medias.push({ originalSource: url, alt: altImages || norm, mediaContentType: 'IMAGE' });
        } else {
          console.log(`   [shopify] ❌ ABANDON image après 3 essais : ${cheminLocal}`);
        }
      }
      if (medias.length === 0) continue;

      // 2. Creer les medias sur le produit
      const dataMedia = await shopifyGraphQL(`
        mutation createMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media { ... on MediaImage { id } }
            mediaUserErrors { field message }
          }
        }
      `, { productId: productGid, media: medias });

      const errMedia = dataMedia.productCreateMedia?.mediaUserErrors || [];
      if (errMedia.length) console.log(`   [shopify] erreurs création média ${norm} :`, JSON.stringify(errMedia));

      const mediaIds = (dataMedia.productCreateMedia?.media || []).map((m) => m.id).filter(Boolean);
      nbImages += mediaIds.length;
      console.log(`   [shopify] ${norm} : ${mediaIds.length}/${chemins.length} média(s) créé(s)`);

      // 3. Attendre que les medias soient prets (statut READY) avant d'associer
      await attendreMediasPrets(mediaIds);


      // 4. Associer ces medias aux variantes de cette couleur
      const variantIds = variantesParCouleur[norm.toUpperCase().trim()] || [];
      if (mediaIds.length > 0 && variantIds.length > 0) {
        // Chaque variante recoit le 1er media de sa couleur (l'image principale = la face)
        const variantMedia = variantIds.map((variantId) => ({
          variantId,
          mediaIds: [mediaIds[0]],
        }));

        const dataAppend = await shopifyGraphQL(`
          mutation appendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
            productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
              product { id }
              userErrors { field message }
            }
          }
        `, { productId: productGid, variantMedia });

        const errApp = dataAppend.productVariantAppendMedia?.userErrors || [];
        if (errApp.length) console.log(`   [shopify] assoc image-variante ${norm} :`, JSON.stringify(errApp));
        else console.log(`   [shopify] ${norm} : image associée à ${variantIds.length} variantes`);
      }
    }
  }

  // 8. PUBLIER le produit sur la Boutique en ligne (sinon actif mais invisible)
  if (ONLINE_STORE_PUB_ID) {
    try {
      const pub = await shopifyGraphQL(`
        mutation publish($id: ID!, $pubId: ID!) {
          publishablePublish(id: $id, input: { publicationId: $pubId }) {
            userErrors { field message }
          }
        }
      `, { id: productGid, pubId: ONLINE_STORE_PUB_ID });
      const errPub = pub.publishablePublish?.userErrors || [];
      if (errPub.length) console.log('   [shopify] ⚠️ publication :', JSON.stringify(errPub));
      else console.log('   [shopify] ✅ produit publié sur la Boutique en ligne');
    } catch (err) {
      console.log(`   [shopify] ⚠️ publication échouée : ${err.message}`);
    }
  }

  return {
    id: productGid,
    titre,
    nbVariantes,
    nbImages,
    couleurs: couleursNorm.map((c) => c.norm),
    tailles: taillesValides,
    adminUrl: `https://admin.shopify.com/store/${(store || '').replace('.myshopify.com', '')}/products/${idNum}`,
  };
}

// Attend que les medias soient au statut READY (Shopify traite les images en asynchrone).
// On poll jusqu'a 20 fois (max ~20s).
async function attendreMediasPrets(mediaIds) {
  if (!mediaIds.length) return;
  for (let i = 0; i < 20; i++) {
    const data = await shopifyGraphQL(`
      query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on MediaImage { id status }
        }
      }
    `, { ids: mediaIds });

    const noeuds = (data.nodes || []).filter(Boolean);
    const tousPrets = noeuds.length > 0 && noeuds.every((n) => n.status === 'READY');
    if (tousPrets) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Si toujours pas prets : on log le statut pour diagnostic
  const data = await shopifyGraphQL(`
    query($ids: [ID!]!) { nodes(ids: $ids) { ... on MediaImage { id status } } }
  `, { ids: mediaIds });
  const statuts = (data.nodes || []).filter(Boolean).map((n) => n.status);
  console.log(`   [shopify] ⚠️ médias pas tous READY après 20s : ${statuts.join(', ')}`);
}

// Uploade un fichier image local sur Shopify (staged upload) et renvoie l'URL.
async function uploaderImage(cheminLocal) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const bufferOriginal = await fs.readFile(cheminLocal);
    const nomBase = path.basename(cheminLocal).replace(/\.(png|jpe?g)$/i, '');

    // Compression JPEG (qualité 88 = super qualité) : PNG lourd → JPEG léger.
    // On uploade en JPEG (PAS WebP) : Shopify sert du WebP aux navigateurs modernes
    // et garde le JPEG en secours pour les 3% qui ne lisent pas le WebP.
    let buffer, nom, mimeType;
    try {
      buffer = await sharp(bufferOriginal)
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      nom = `${nomBase}.jpg`;
      mimeType = 'image/jpeg';
      console.log(`   [image] ${path.basename(cheminLocal)} → JPEG (${Math.round(bufferOriginal.length / 1024)}Ko → ${Math.round(buffer.length / 1024)}Ko)`);
    } catch (e) {
      // Si sharp échoue, on garde l'original
      buffer = bufferOriginal;
      nom = path.basename(cheminLocal);
      mimeType = nom.endsWith('.png') ? 'image/png' : 'image/jpeg';
      console.log(`   [image] ⚠️ compression échouée, upload original : ${e.message}`);
    }

    // 1. Demander une URL d'upload temporaire
    const staged = await shopifyGraphQL(`
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }
    `, {
      input: [{
        filename: nom,
        mimeType,
        httpMethod: 'POST',
        resource: 'IMAGE',
      }],
    });

    const target = staged.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) return null;

    // 2. Uploader le fichier vers cette URL
    const form = new FormData();
    target.parameters.forEach((p) => form.append(p.name, p.value));
    form.append('file', new Blob([buffer]), nom);

    const up = await fetch(target.url, { method: 'POST', body: form });
    if (!up.ok && up.status !== 201 && up.status !== 204) {
      console.log('   [shopify] upload image echoue :', up.status);
      return null;
    }

    return target.resourceUrl;
  } catch (err) {
    console.log('   [shopify] erreur upload image :', err.message);
    return null;
  }
}