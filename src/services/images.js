// services/images.js
// Genere les 4 photos produit (face, dos, 3/4, detail) a partir d'une image source,
// via Nano Banana (Gemini). Fond beige #EDE7DD, mannequin grande taille, sans logo.
//
// Methode :
//   1. on telecharge l'image source (URL -> base64)
//   2. on genere la photo FACE a partir de la source
//   3. on genere DOS / 3-4 / DETAIL a partir de la FACE (pour garder le meme mannequin)

import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const MODELE = 'gemini-2.5-flash-image'; // = Nano Banana. Passe a 'gemini-3-pro-image' pour la version Pro.
const FOND = '#EDE7DD';

// Traduction des couleurs PFS (FR) vers une description anglaise comprise par l'IA.
// On peut aussi passer le code hex pour plus de precision.
const COULEURS_EN = {
  blanc: 'white', noir: 'black', orange: 'orange', jaune: 'yellow',
  rouge: 'red', rose: 'pink', bleu: 'blue', marine: 'navy blue',
  vert: 'green', kaki: 'khaki green', beige: 'beige', taupe: 'taupe',
  marron: 'brown', gris: 'grey', violet: 'purple', bordeaux: 'burgundy',
  turquoise: 'turquoise', corail: 'coral', fuchsia: 'fuchsia', moutarde: 'mustard yellow',
};

function couleurEn(labelFr, hex) {
  const cle = (labelFr || '').toLowerCase().trim();
  const en = COULEURS_EN[cle] || cle; // si inconnue, on garde le mot tel quel
  return hex ? `${en} (hex ${hex})` : en;
}

// Consigne d'exposition selon la couleur (pour bien voir les details du tissu).
// Noir = aplat sombre -> on eclaircit. Blanc = risque de surexposition -> on assombrit.
function consigneExposition(labelFr) {
  const c = (labelFr || '').toLowerCase().trim();
  if (['noir', 'black'].includes(c) || c.includes('noir')) {
    return ' IMPORTANT: the garment is BLACK. Slightly OVER-EXPOSE / brighten the garment and use soft directional lighting so the fabric texture, pattern and embroidery details remain clearly visible (avoid a flat black shape with no detail).';
  }
  if (['blanc', 'white'].includes(c) || c.includes('blanc')) {
    return ' IMPORTANT: the garment is WHITE. Slightly UNDER-EXPOSE / avoid blown-out highlights, use soft lighting so the fabric texture, pattern and embroidery details stay visible (do not let the white become a flat overexposed shape).';
  }
  return '';
}

// --- Prompts par angle ---

function promptFace(couleur, expo = '') {
  return `Professional fashion e-commerce photo. A plus-size female model wearing exactly the garment from the reference image${couleur ? `, in ${couleur} color` : ''}. Full-body shot, vertical 4:5 framing, high resolution, sharp fabric detail.

Background: seamless studio, solid warm sand beige color ${FOND}, very light and uniform, soft natural shadow on the floor, professional fashion lighting like a high-end activewear brand lookbook.

Keep the garment 100% identical to the reference: same cut, same length, same neckline, same sleeves, same fabric, same pattern, and especially the SAME EXACT COLOR as the reference image. Do not redesign, shorten, recolor, or alter the garment in any way.

Remove any visible logo, brand name, text, watermark or label from the garment and the image. The garment must be plain with no branding or writing.${expo}`;
}

// Dos a partir d'une VRAIE photo de dos (sur cintre ou a plat) : on l'habille sur le mannequin
function promptDosDepuisVraiePhoto() {
  return `The reference image shows the BACK of this garment (possibly on a hanger or laid flat). Generate a professional photo of a plus-size female model wearing this exact garment, seen from BEHIND, so we clearly see this exact back design on her body. Keep the back design, fabric, color and details 100% identical to the reference. Full-body, vertical 4:5, high resolution. Warm sand beige studio background ${FOND}, soft lighting. No logo, no text, no watermark.`;
}

// Dos a partir d'une VRAIE photo du vetement de dos (cintre/a plat) + la face generee.
// 2 images : [face generee = LA personne] + [dos du vetement = le design a mettre].
function promptDosMultiRef(expo = '') {
  return `You are given TWO reference images:
- IMAGE 1: a plus-size female model photographed from the front (use her ONLY for identity: same skin tone, same hair color and hairstyle).
- IMAGE 2: the BACK of the garment she is wearing (shown flat or on a hanger, no person).

Generate a NEW, natural photo of this same woman seen FROM BEHIND, standing in a natural relaxed back-view pose (NOT a mirrored copy of the front image — a real, anatomically correct back view of a plus-size body). She wears the garment whose back is shown in IMAGE 2. The back of her outfit must match IMAGE 2 exactly (same cut, length, fabric, pattern, color). Full-body, vertical 4:5 format, high resolution. Warm sand beige studio background ${FOND}, soft professional lighting. No logo, no text, no watermark.${expo}`;
}

// Dos recolore + face : 2 images aussi (face = personne, dos d'une autre couleur = design a recolorer).
function promptDosMultiRefRecolore(couleurEnTexte, expo = '') {
  return `You are given TWO reference images:
- IMAGE 1: a plus-size female model photographed from the front (use her ONLY for identity: same skin tone, same hair).
- IMAGE 2: the BACK of the garment in a DIFFERENT color.

Generate a NEW natural photo of this same woman seen FROM BEHIND, in a natural relaxed back-view pose (not a mirrored front image), wearing this garment RECOLORED in ${couleurEnTexte}. Keep the back design, cut, length and fabric identical to IMAGE 2 — ONLY change the color to ${couleurEnTexte}. Full-body, vertical 4:5, high resolution. Warm sand beige studio background ${FOND}, soft lighting. No logo, no text, no watermark.${expo}`;
}

// Dos DEDUIT a partir de la face uniquement (dernier recours, pas de vraie photo de dos).
function promptDosDeduit(expo = '') {
  return `Same model and same exact garment as the reference image, photographed from behind, showing the back of the outfit. Keep the SAME woman: same body, same skin tone, same hair and hairstyle as the reference. Full-body, vertical 4:5, high resolution. Same warm sand beige studio background ${FOND} as the reference, same lighting. No logo, no text, no watermark.`;
}

// Dos RECOLORE : on a une photo de dos d'une AUTRE couleur (ex: blanc),
// on garde le design mais on change la teinte vers la couleur voulue.
function promptDosRecolore(couleurEnTexte) {
  return `The reference image shows the BACK of this garment in a different color. Generate a professional photo of a plus-size female model wearing this exact same garment, seen from BEHIND, but RECOLORED in ${couleurEnTexte}. Keep the cut, length, fabric, embroidery and ALL design details 100% identical to the reference — ONLY change the color to ${couleurEnTexte}. Full-body, vertical 4:5, high resolution. Warm sand beige studio background ${FOND}, soft lighting. No logo, no text, no watermark.`;
}

function promptTroisQuart(expo = '') {
  return `Same model and same exact garment as the reference image, three-quarter side angle pose. Full-body, vertical 4:5, high resolution. Same warm sand beige studio background ${FOND} as the reference, same lighting. Keep the model's face, body, hair and the garment identical to the reference. No logo, no text, no watermark.${expo}`;
}

function promptDetailDepuisVraiePhoto() {
  return `The reference image is a close-up of this garment's fabric/detail. Generate a clean close-up detail shot of the same garment, focusing on the fabric texture and details. Vertical 4:5, high resolution, sharp. Warm sand beige studio background ${FOND}. Keep fabric, color and pattern identical to the reference. No logo, no text.`;
}

function promptDetailDeduit() {
  return `Close-up detail shot of the same garment from the reference image. Focus on the fabric texture, neckline and seams. Vertical 4:5, high resolution, sharp fabric detail. Same warm sand beige studio background ${FOND} as the reference. Keep the fabric, color and pattern identical to the reference. No logo, no text, no watermark.`;
}

// --- Helpers ---

async function urlVersBase64(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Telechargement image echoue (${reponse.status}) : ${url}`);
  const buffer = Buffer.from(await reponse.arrayBuffer());
  const mime = reponse.headers.get('content-type') || 'image/jpeg';
  return { base64: buffer.toString('base64'), mime };
}

// Appelle Nano Banana avec UNE OU PLUSIEURS images de reference + un prompt.
// imageRefs peut etre un objet {base64,mime} ou un tableau de tels objets.
async function genererImage(ai, imageRefs, prompt) {
  const refs = Array.isArray(imageRefs) ? imageRefs : [imageRefs];
  const contents = [
    ...refs.map((r) => ({ inlineData: { mimeType: r.mime, data: r.base64 } })),
    { text: prompt },
  ];

  const reponse = await ai.models.generateContent({
    model: MODELE,
    contents,
    config: {
      responseModalities: ['Image'],
      imageConfig: { aspectRatio: '4:5' }, // format portrait, ideal fiche produit
    },
  });

  // On cherche le bloc image dans la reponse
  const parts = reponse.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        base64: part.inlineData.data,
        mime: part.inlineData.mimeType || 'image/png',
      };
    }
  }
  throw new Error('Aucune image renvoyee par le modele.');
}

// --- Fonction principale exportee ---
// photos      : [{url, role}] de la couleur en cours (role ∈ avant|dos|detail)
// labelCouleur: nom FR de la couleur (ex "Orange") — pour la recoloration
// hexCouleur  : code hex de la couleur (optionnel, plus precis)
// dosModele   : { url } photo de dos d'une AUTRE couleur, a recolorer (optionnel)
// detailModele: { url } idem pour le detail (optionnel)
// dossierSortie : ou sauvegarder
export async function genererPhotosProduit(photos, labelCouleur, hexCouleur, dosModele, detailModele, dossierSortie) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  await fs.mkdir(dossierSortie, { recursive: true });

  const photoAvant = photos.find((p) => p.role === 'avant');
  const photoDos = photos.find((p) => p.role === 'dos');
  const photoDetail = photos.find((p) => p.role === 'detail');

  if (!photoAvant) throw new Error('Aucune photo "avant" fournie pour cette couleur.');

  const couleurTexte = couleurEn(labelCouleur, hexCouleur);
  const expo = consigneExposition(labelCouleur);
  const resultats = {};

  // 1. FACE — depuis la photo "avant" de cette couleur
  console.log(`   [images] FACE (${labelCouleur})...`);
  const refAvant = await urlVersBase64(photoAvant.url);
  const face = await genererImage(ai, refAvant, promptFace(couleurTexte, expo));
  resultats.face = await sauver(face, dossierSortie, 'face');

  // 2. DOS — UNIQUEMENT si vraie photo de dos OU dos modèle (sinon on saute)
  // On passe TOUJOURS la face generee comme 1re reference (= LA personne a garder)
  if (photoDos) {
    console.log('   [images] DOS (vraie photo + face = même mannequin)...');
    const refDos = await urlVersBase64(photoDos.url);
    const dos = await genererImage(ai, [face, refDos], promptDosMultiRef(expo));
    resultats.dos = await sauver(dos, dossierSortie, 'dos');
  } else if (dosModele) {
    console.log(`   [images] DOS (modèle recoloré en ${couleurTexte} + face)...`);
    const refModele = await urlVersBase64(dosModele.url);
    const dos = await genererImage(ai, [face, refModele], promptDosMultiRefRecolore(couleurTexte, expo));
    resultats.dos = await sauver(dos, dossierSortie, 'dos');
  } else {
    console.log('   [images] DOS ignoré (pas de photo dos fournie)');
  }

  // 3. 3/4 — deduit depuis la face
  console.log('   [images] 3/4...');
  const tq = await genererImage(ai, face, promptTroisQuart(expo));
  resultats.troisQuart = await sauver(tq, dossierSortie, 'troisQuart');

  // 4. DETAIL — vraie photo > modele recolore > deduit
  if (photoDetail) {
    console.log('   [images] DÉTAIL (vraie photo)...');
    const refDet = await urlVersBase64(photoDetail.url);
    const det = await genererImage(ai, refDet, promptDetailDepuisVraiePhoto());
    resultats.detail = await sauver(det, dossierSortie, 'detail');
  } else if (detailModele) {
    console.log(`   [images] DÉTAIL (modèle recoloré en ${couleurTexte})...`);
    const refDet = await urlVersBase64(detailModele.url);
    const det = await genererImage(ai, refDet, promptDetailDepuisVraiePhoto() + ` Recolor to ${couleurTexte}.`);
    resultats.detail = await sauver(det, dossierSortie, 'detail');
  } else {
    console.log('   [images] DÉTAIL (déduit depuis la face)...');
    const det = await genererImage(ai, face, promptDetailDeduit());
    resultats.detail = await sauver(det, dossierSortie, 'detail');
  }

  return resultats;
}

function ext(mime) {
  return mime.includes('png') ? 'png' : 'jpg';
}
function chemin(dossier, nom, mime) {
  return path.join(dossier, `${nom}.${ext(mime)}`);
}
async function sauver(img, dossier, nom) {
  const fichier = path.join(dossier, `${nom}.${ext(img.mime)}`);
  await fs.writeFile(fichier, Buffer.from(img.base64, 'base64'));
  return fichier;
}