// routes/import.js
// Circuit complet via FILE D'ATTENTE : modale -> file -> (images + SEO + Shopify) un par un.

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { deplierTailles } from '../utils/tailles.js';
import { creerProduit, deduireTag, estUnHaut } from '../services/shopify.js';
import { genererSEO } from '../services/seo.js';
import { genererEtUploaderVideo } from '../services/video.js';
import { ajouterFile, etatFile, definirTraiteur } from '../services/file-attente.js';

// Bascule du moteur d'images : "openai" ou "gemini" (defaut). Defini dans .env (MOTEUR_IMAGE).
const MOTEUR = (process.env.MOTEUR_IMAGE || 'gemini').toLowerCase();
const { genererPhotosProduit } = MOTEUR === 'openai'
  ? await import('../services/images-openai.js')
  : await import('../services/images.js');

console.log(`[config] Moteur d'images : ${MOTEUR.toUpperCase()}`);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ─── Traitement d'UN produit (appelé par la file d'attente) ───
async function traiterProduit(paquet) {
  const { titre, couleurs, tailleMin, tailleMax, prixVente, stock, categorie, modelesGlobaux } = paquet;

  const tailles = deplierTailles(tailleMin, tailleMax);
  const tag = deduireTag(categorie || titre);

  console.log(`\n[import] "${titre}" — ${couleurs.length} couleur(s) x ${tailles.length} taille(s) — tag: ${tag || 'aucun'}`);

  // --- 1. GENERER LES IMAGES par couleur ---
  const dossierBase = path.join(__dirname, '../../sortie-import', Date.now().toString());
  const imagesParCouleur = {};
  let cheminFacePremiereCouleur = null;   // pour la vidéo (face de la 1ère couleur)
  let dossierPremiereCouleur = null;

  const dosModele = modelesGlobaux?.dos ? { url: modelesGlobaux.dos.url } : null;
  const detailModele = modelesGlobaux?.detail ? { url: modelesGlobaux.detail.url } : null;

  // Trouver la FACE MODÈLE ⭐ : la photo "avant" de la couleur marquée faceModele=true
  let urlFaceModele = null;
  const couleurModele = couleurs.find((c) => c.faceModele);
  if (couleurModele) {
    const av = (couleurModele.photos || []).find((p) => p.role === 'avant');
    if (av) urlFaceModele = av.url;
  }

  for (const couleur of couleurs) {
    console.log(`[import] Images pour ${couleur.label}...`);
    const dossierCouleur = path.join(dossierBase, couleur.label.replace(/\s+/g, '_'));
    try {
      const resultats = await genererPhotosProduit(
        couleur.photos,
        couleur.label,
        couleur.hex,
        dosModele,
        detailModele,
        dossierCouleur,
        {
          recoloriser: !!couleur.recoloriser && !!urlFaceModele,
          faceModele: urlFaceModele,
          estHaut: estUnHaut(categorie || titre),  // autorise la pose assise si c'est un haut
          garderPose: !!paquet.garderPose,         // garder la pose de la photo PFS (case modale)
        }
      );
      imagesParCouleur[couleur.label] = Object.values(resultats);
      // Mémoriser la FACE de la 1ère couleur (pour la vidéo)
      if (!cheminFacePremiereCouleur && resultats.face) {
        cheminFacePremiereCouleur = resultats.face;
        dossierPremiereCouleur = dossierCouleur;
      }
    } catch (err) {
      console.log(`[import] ⚠️ Images ${couleur.label} : ${err.message}`);
    }
  }

  // --- 2. GENERER LE SEO ---
  let seo = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      console.log('[import] Génération SEO (Claude)...');
      const premiereCouleur = couleurs[0]?.label;
      const cheminsP1 = imagesParCouleur[premiereCouleur] || [];
      const urlPhotoLocale = cheminsP1[0] || null;

      seo = await genererSEO({
        titre,
        categorie: categorie || titre,
        productType: paquet.productType || null,
        description: paquet.description || '',
        composition: paquet.composition || '',
        collection: paquet.collection || '',
        couleurs: couleurs.map((c) => c.label),
        tailles,
        urlPhotoLocale,
      });
      console.log(`[import] SEO ok — titre: "${seo.titre}" (photo: ${seo.photoUtilisee ? 'oui' : 'non'})`);
    } catch (err) {
      console.log(`[import] ⚠️ SEO non généré : ${err.message} (on continue sans)`);
    }
  } else {
    console.log('[import] (pas de ANTHROPIC_API_KEY → SEO ignoré)');
  }

  // --- 2bis. VIDÉO (optionnelle, si case cochée dans la modale) ---
  let videoFileId = null;
  if (paquet.genererVideo && cheminFacePremiereCouleur) {
    console.log('[import] Génération de la vidéo (Kling + compression)...');
    try {
      videoFileId = await genererEtUploaderVideo(cheminFacePremiereCouleur, dossierPremiereCouleur);
      if (videoFileId) console.log('[import] ✅ Vidéo prête et uploadée');
    } catch (err) {
      console.log(`[import] ⚠️ Vidéo non générée : ${err.message} (on continue sans)`);
    }
  }

  // --- 3. CREER LE PRODUIT Shopify ---
  console.log('[import] Creation du produit Shopify...');
  const produit = await creerProduit({
    titre: seo?.titre || titre,
    couleurs: couleurs.map((c) => ({ label: c.label, hex: c.hex, reference: c.reference })),
    tailles,
    prix: prixVente,
    stock: stock ?? 0,
    tag,
    tags: (Array.isArray(paquet.tags) && paquet.tags.length > 0) ? paquet.tags : (tag ? [tag] : []),
    productType: paquet.productType || null,
    description: seo?.descriptionHtml || (paquet.description ? `<p>${paquet.description}</p>` : ''),
    metaDescription: seo?.metaDescription || null,
    altImages: seo?.altImages || null,
    compositionHtml: seo?.compositionHtml || null,
    avis: seo ? { nom: seo.avisNom, date: seo.avisDate, texte: seo.avisTexte } : null,
    videoFileId,
    atouts: seo ? {
      intro: seo.atoutsIntro,
      a1: `${seo.atout1Titre}. ${seo.atout1Texte}`,
      a2: `${seo.atout2Titre}. ${seo.atout2Texte}`,
      a3: `${seo.atout3Titre}. ${seo.atout3Texte}`,
    } : null,
    fournisseur: paquet.fournisseur || null,
    reference: paquet.reference || null,
    pfsUrl: paquet.pageUrl || null,
    statut: 'ACTIVE',
    imagesParCouleur,
    store: process.env.SHOPIFY_STORE,
  });

  console.log(`[import] ✅ Produit cree : ${produit.nbVariantes} variantes, ${produit.nbImages} images — ${produit.adminUrl}`);

  return {
    titre: produit.titre,
    nbVariantes: produit.nbVariantes,
    nbImages: produit.nbImages,
    adminUrl: produit.adminUrl,
  };
}

// On donne ce traiteur à la file d'attente
definirTraiteur(traiterProduit);

// ─── Route : met le produit en FILE et répond tout de suite ───
router.post('/import-produit', (req, res) => {
  try {
    const paquet = req.body;
    if (!paquet || typeof paquet !== 'object') {
      return res.status(400).json({ ok: false, erreur: 'Paquet vide ou invalide.' });
    }

    const { titre, couleurs, tailleMin, tailleMax } = paquet;
    const manquants = [];
    if (!titre) manquants.push('titre');
    if (!Array.isArray(couleurs) || couleurs.length === 0) manquants.push('couleurs');
    if (tailleMin == null) manquants.push('tailleMin');
    if (tailleMax == null) manquants.push('tailleMax');
    if (manquants.length > 0) {
      return res.status(400).json({ ok: false, erreur: `Champs manquants : ${manquants.join(', ')}` });
    }

    // On empile et on répond IMMÉDIATEMENT (traitement en arrière-plan)
    const id = ajouterFile(paquet);
    const etat = etatFile();
    return res.json({
      ok: true,
      enFile: true,
      id,
      message: `"${titre}" ajouté à la file (position ${etat.resume.attente}).`,
      resume: etat.resume,
    });
  } catch (err) {
    console.error('[import] Erreur :', err.message);
    return res.status(500).json({ ok: false, erreur: err.message });
  }
});

// ─── Route : état de la file (pour le badge de suivi) ───
router.get('/file', (req, res) => {
  res.json({ ok: true, ...etatFile() });
});

export default router;