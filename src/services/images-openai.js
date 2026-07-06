// services/images-openai.js
// Variante OpenAI (GPT Image 2) du generateur d'images.
// Meme signature que images.js (genererPhotosProduit) pour etre interchangeable.
//
// Utilise l'endpoint images/edits qui accepte des images de reference.
// Modele : gpt-image-2 (le flagship). Resolution 1024x1280 (~4:5).

import OpenAI, { toFile } from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';

const MODELE = 'gpt-image-2';
const FOND = '#EDE7DD';

// Consigne forte anti-peau-orange (GPT a tendance à trop bronzer/saturer).
const PEAU = 'IMPORTANT — SKIN TONE: the model must have a completely natural, realistic skin tone with neutral, true-to-life colors. Absolutely NO orange, NO fake tan, NO bronzed effect, NO yellow or amber tint, NO oversaturated or sunburnt look. The skin must look like a real photograph under neutral studio lighting, with natural undertones. Keep the complexion soft, even and realistic.';
const TAILLE = '1024x1536'; // portrait (le plus proche du 4:5 dispo chez OpenAI)

// --- Traduction couleurs FR -> EN ---
const COULEURS_EN = {
  blanc: 'white', noir: 'black', orange: 'orange', jaune: 'yellow',
  rouge: 'red', rose: 'pink', bleu: 'blue', marine: 'navy blue',
  vert: 'green', kaki: 'khaki green', beige: 'beige', taupe: 'taupe',
  marron: 'brown', gris: 'grey', violet: 'purple', bordeaux: 'burgundy',
  turquoise: 'turquoise', corail: 'coral', fuchsia: 'fuchsia', moutarde: 'mustard yellow',
};
function couleurEn(labelFr, hex) {
  const cle = (labelFr || '').toLowerCase().trim();
  const en = COULEURS_EN[cle] || cle;
  return hex ? `${en} (hex ${hex})` : en;
}
function consigneExposition(labelFr) {
  const c = (labelFr || '').toLowerCase().trim();
  if (c.includes('noir')) return ' The garment is BLACK: slightly brighten it with soft directional light so the fabric texture, pattern and embroidery stay clearly visible.';
  if (c.includes('blanc')) return ' The garment is WHITE: avoid blown-out highlights, use soft light so the fabric texture and embroidery stay visible.';
  return '';
}

// --- Prompts (bases sur le prompt detaille de Nathan, fond fixe, meme femme entre angles) ---

// FACE : le prompt de reference complet. La photo fait foi pour la couleur (pas de hex).
// ─── Profils mannequins variés (belles femmes rondes, 35-60 ans) ───
// On tire UN profil complet par produit (origine + cheveux + pose), gardé sur tous les angles
// (le dos et le 3/4 partent de la face générée, donc même femme automatiquement).

// Origines avec pondération (chaque entrée répétée selon sa fréquence voulue).
// Européenne 40%, Latine 30%, Asiatique ~12%, Méditerranéenne ~8%, Métisse/Noire ~5%, autres ~5%.
const ORIGINES = [
  // Européenne (40%) → 8 entrées
  ...Array(8).fill('a European woman with a fair to lightly sun-kissed natural skin tone'),
  // Latine (30%) → 6 entrées
  ...Array(6).fill('a Latina woman (Colombian, Argentinian or Brazilian look) with warm tanned natural skin'),
  // Asiatique (~12%) → 2-3 entrées
  ...Array(2).fill('an East-Asian woman with smooth natural skin'),
  // Méditerranéenne (~8%) → 2 entrées
  ...Array(2).fill('a Mediterranean woman with olive natural skin'),
  // Métisse / Noire (rare ~5%) → 1 entrée
  'a mixed-race or Black woman with beautiful natural skin',
];

// Cheveux variés (couleur + coupe) — pour que même deux Européennes soient différentes.
const CHEVEUX = [
  'long wavy brown hair',
  'shoulder-length chestnut hair',
  'long sleek black hair',
  'elegant blonde bob',
  'natural red/auburn hair with light freckles',
  'short modern brown haircut',
  'long dark wavy hair',
  'curly hair',
  'salt-and-pepper elegant hair',
  'honey-blonde layered hair',
  'dark hair tied back in a chic low bun',
  'warm caramel balayage hair',
];

// Poses DEBOUT universelles (marchent pour TOUT vêtement : robe, pantalon, top — vêtement entier visible).
// Mix de mouvement (marche, cheveux au vent), interaction vêtement et attitudes mode.
// Une seule pose "bras le long du corps" pour éviter la répétition.
const POSES_UNIVERSELLES = [
  // Mouvement / marche
  'walking gently toward the camera, natural stride, the garment flowing softly with the movement, confident relaxed expression, garment fully visible from the front',
  'walking slightly sideways like on a runway, the fabric following the movement, elegant editorial energy, garment fully visible',
  // Cheveux au vent / dynamique
  'soft hair movement as if in a light breeze, one hand gently pushing a strand of hair away, bright natural smile, lively energy, garment fully visible from the front',
  'turning her head with a subtle hair movement, joyful candid expression, garment fully visible from the front',
  'one hand running softly through her hair pushed back, confident lively look, garment fully visible from the front',
  // Interaction avec le vêtement
  'both hands softly holding the lower part of the garment to show its drape and flow, gentle smile, garment fully visible',
  'one hand delicately touching the sleeve or neckline, calm elegant attitude, garment fully visible from the front',
  // Attitudes mode
  'a light hip movement with one hand on the waist, confident attractive attitude, garment fully visible from the front',
  'a step to the side, weight on one leg, editorial fashion posture, calm captivating gaze, garment fully visible',
  'turned three-quarter with a glance over the shoulder, elegant and graceful, garment clearly visible',
  // Expressions vivantes
  'a big genuine natural smile, joyful energy, relaxed hands, garment fully visible from the front',
  'caught mid-laugh with the head slightly tilted back, spontaneous joyful expression, garment fully visible from the front',
  // Une seule pose neutre "bras bas" (classique)
  'standing naturally facing the camera, a soft warm smile, arms relaxed and low, garment fully visible from the front',
];

// Poses réservées aux HAUTS (assise : couperait une robe/pantalon).
const POSES_HAUTS = [
  'sitting on the edge of a cube or bench, body slightly at a three-quarter angle, relaxed editorial posture, calm captivating gaze toward the camera, garment clearly visible',
];

// Variante sac assorti (RARE) — ajoutée à une pose de temps en temps.
const SAC = ' She also carries a simple elegant handbag matching the outfit, worn on her shoulder.';

const piocher = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Tire 2 poses DIFFÉRENTES (une pour la face, une pour le 3/4) selon le type de vêtement.
function tirerPoses(estHaut) {
  const pool = estHaut ? [...POSES_UNIVERSELLES, ...POSES_HAUTS] : [...POSES_UNIVERSELLES];
  const poseFace = piocher(pool);
  let pose34 = piocher(pool);
  let garde = 0;
  while (pose34 === poseFace && garde < 10) { pose34 = piocher(pool); garde++; }
  // Sac rare : ~1 produit sur 6, ajouté à la pose de face
  const avecSac = Math.random() < 1 / 6;
  return { poseFace: poseFace + (avecSac ? SAC : ''), pose34 };
}

// Tire un profil complet pour un produit (origine + cheveux). Les poses sont gérées à part.
function profilAleatoire() {
  return {
    origine: piocher(ORIGINES),
    cheveux: piocher(CHEVEUX),
  };
}

function promptFace(couleur, expo, profil, pose, garderPose = false) {
  const p = profil || profilAleatoire();
  const poseTxt = pose || 'standing naturally facing the camera, a soft warm smile, arms relaxed and low, garment fully visible from the front';
  // Consigne de pose : soit on garde celle de la photo, soit on applique une pose de notre liste.
  const blocPose = garderPose
    ? `POSE (important): KEEP THE EXACT SAME pose, body position, arms, hands and framing as the original reference photo. Do not change the pose — only replace the person. The garment must stay fully visible exactly as in the original photo.`
    : `POSE AND EXPRESSION (important, follow exactly): ${poseTxt}. The garment must always stay fully visible and not be hidden or deformed by the pose. The photo must make people want to buy the product.`;
  return `From the provided reference image, create a new professional studio e-commerce photo.

MAIN GOAL: keep the worn garment extremely faithful. The garment must keep exactly the same cut, the same color, the same fabric, the same details, the same seams, the same buttons, the same patterns, the same sleeves, the same collar, the same length and the same drape as in the original image. Do not modify the garment design.

CRITICAL COLOR FIDELITY: reproduce the EXACT same color and shade as the reference garment, pixel-perfect. Do not lighten, darken, saturate or shift the hue. The color on the model must be indistinguishable from the color on the reference image. This is the most important rule.

Completely remove all logos, texts, watermarks, visible labels, commercial inscriptions or brand-related graphic elements. No logo or text must appear in the final image.

Replace the original person with a beautiful plus-size (full-figured, round) female model, ${p.origine}, between 35 and 60 years old, with ${p.cheveux}. She has a harmonious round realistic figure, elegant and graceful, with a fashion-model posture and natural professional makeup. The image is a modest, tasteful, professional fashion catalog photo (no suggestive or revealing framing).

The model must wear the garment realistically, with a natural fit on a plus-size body. The garment must stay clearly visible, undeformed, not shortened, not simplified, clearly presented for a product page.

Create a clean, bright, high-end studio background, suitable for a plus-size ready-to-wear shop: uniform warm sand beige background ${FOND}, professional diffuse lighting, natural shadows, realistic rendering, editorial e-commerce photo quality.

${blocPose}

Style: realistic photography, high resolution, professional rendering, sharp details, soft light, natural proportions, premium fashion catalog quality.

${PEAU}

Do NOT create an illustration, do NOT create a drawing, do NOT change the garment, do NOT add a logo, do NOT add text, do NOT invent patterns, do NOT change the color, do NOT change the fabric, do NOT change the cut.

CRITICAL FIDELITY RULE: Reproduce ONLY what is visible on the reference garment. Look very carefully at the reference image and copy every real detail EXACTLY (buttons, rings, straps, embroidery, fastenings, trims, seams, prints). Do NOT invent, add, modify or imagine ANY detail. If the straps have a specific ornament (ring, buckle, knot...), reproduce it EXACTLY as it appears — do not redesign it. Do NOT invent or add any element that is not present in the reference: no added pockets, no hands in pockets if there are no pockets, no added belt, no added buttons, no added zippers, no added folds or seams. If the garment has no visible pockets, the model must NOT put her hands in pockets. The model's pose must keep the garment fully visible and must not hide or alter any part of it.${expo}`;
}

// DOS : on passe la face generee (image 1) + eventuellement le vrai dos (image 2).
// On garde LA MEME femme et le meme vetement, on change juste l'angle.
function promptDos(couleur, expo) {
  return `Using the reference image(s): keep EXACTLY THE SAME woman as in the first reference image (same face, same skin tone, same hair color and hairstyle, same body), and the SAME garment with the same exact color, fabric and details.

Create a new professional studio e-commerce photo of this same model seen FROM BEHIND, in a natural relaxed back-view pose (a real, anatomically correct plus-size back view, not a mirrored front image). The back of the garment must be shown clearly and faithfully. Same uniform warm sand beige studio background ${FOND}, same professional diffuse lighting.

Remove all logos, text, watermarks and labels. Match the exact color of the reference. Realistic photography, high resolution, sharp details, premium fashion catalog quality. Do not change the garment, do not add logo or text, do not change the color. Reproduce ONLY the real details visible on the garment — do NOT invent or add any element (pockets, buttons, rings, belt...) that is not really there.${expo}`;
}

// 3/4 : meme femme, meme vetement, angle trois-quarts.
function promptTroisQuart(couleur, expo, pose) {
  const poseTxt = pose || 'a natural relaxed standing pose, arms open, garment fully visible';
  return `You are given TWO reference images:
- IMAGE 1: the model to keep — same woman EXACTLY (same face, skin tone, hair, body, makeup).
- IMAGE 2: the real product photo showing the FULL garment clearly (use it to reproduce the garment faithfully and completely).

Create a NEW professional studio e-commerce photo of the SAME woman as IMAGE 1, wearing exactly the same garment, facing the camera (front view), but in a DIFFERENT pose: ${poseTxt}.

⚠️ IMPORTANT — this is a second photo of the same model from the same photoshoot: keep the SAME frontal front-facing point of view as IMAGE 1 (do NOT turn her to the side, do NOT show her back or profile — the garment must stay seen from the FRONT so nothing is invented). ONLY change her pose and attitude (arm position, hand position, stance, head) so it clearly looks like a different shot, NOT a copy of IMAGE 1. Do not reproduce the exact same pose as IMAGE 1.

Her arms must be relaxed and open (NOT crossed, NOT hiding the garment) so the whole garment stays clearly visible. Reproduce the garment completely and faithfully using IMAGE 2 (do not invent any hidden or side part).

Same uniform warm sand beige studio background ${FOND}, same professional diffuse lighting. Match the exact color of the reference. Realistic photography, high resolution, sharp details, premium fashion catalog quality. No logo, no text, no watermark. Do NOT invent or add any element (pockets, buttons, rings, belt...) that is not on the real garment.${expo}`;
}

// DETAIL : gros plan qui ZOOME sur le tissu/col/motif (part de la face générée).
function promptDetail(couleur, expo) {
  return `Professional e-commerce close-up product photo, shot as if taken by a professional fashion photographer for an online store. Zoom in tightly on the same garment from the reference image: focus on the fabric texture, the weave, the seams, the neckline/collar and any embroidery, print or pattern. The detail must fill most of the frame (a real macro close-up, not the whole garment).

BE 100% FAITHFUL TO THE REFERENCE: reproduce the real details EXACTLY as they appear (the real pattern, the real texture, the real trims, the real stitching, the real color). Do NOT invent, add, redesign or imagine anything that is not in the reference. If a detail is not visible, do not make it up.

This image is for a real e-commerce website, so it must look clean, premium and professional: vertical framing, perfectly sharp, high resolution, uniform warm sand beige background ${FOND}, soft professional studio lighting, realistic rendering. It is a modest, tasteful product detail photo focused on the fabric and craftsmanship (no skin, no cleavage emphasis). Keep the fabric, the exact color and the pattern identical to the reference. No logo, no text, no watermark.${expo}`;
}

// --- Helpers ---
async function urlVersFichier(url, dossier, nom) {
  const rep = await fetch(url);
  if (!rep.ok) throw new Error(`Telechargement echoue (${rep.status})`);
  const buffer = Buffer.from(await rep.arrayBuffer());
  const fichier = path.join(dossier, `_src_${nom}.jpg`); // PFS = jpeg
  await fs.writeFile(fichier, buffer);
  return fichier;
}

// Genere une image via OpenAI images.edit (accepte des images de reference)
async function genererImage(openai, fichiersRef, prompt, dossier, nomSortie) {
  // Charger chaque fichier en File typé pour qu'OpenAI accepte le mimetype
  const images = [];
  for (const f of fichiersRef) {
    const buffer = await fs.readFile(f);
    const type = f.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const nom = path.basename(f).replace(/\.[^.]+$/, type === 'image/png' ? '.png' : '.jpg');
    images.push(await toFile(buffer, nom, { type }));
  }

  // Retry : on réessaie jusqu'à 3 fois en cas d'erreur réseau (connection error, timeout...)
  const MAX_TENTATIVES = 3;
  let rep;
  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    try {
      rep = await openai.images.edit({
        model: MODELE,
        image: images.length === 1 ? images[0] : images,
        prompt,
        size: TAILLE,
      });
      break; // succès → on sort de la boucle
    } catch (err) {
      const msg = err?.message || String(err);
      if (tentative < MAX_TENTATIVES) {
        console.log(`      ⚠️ erreur (${msg}) — nouvel essai ${tentative + 1}/${MAX_TENTATIVES} dans 3s...`);
        await new Promise((r) => setTimeout(r, 3000)); // pause 3s avant de réessayer
      } else {
        throw new Error(`Échec après ${MAX_TENTATIVES} tentatives : ${msg}`);
      }
    }
  }

  const b64 = rep.data[0].b64_json;
  const fichier = path.join(dossier, `${nomSortie}.png`);
  await fs.writeFile(fichier, Buffer.from(b64, 'base64'));
  return fichier;
}

// FACE RECOLORÉE : on garde le mannequin d'une bonne face (IMAGE 1)
// et on applique la vraie couleur d'une autre photo (IMAGE 2).
function promptFaceRecoloree(expo) {
  return `You are given TWO reference images:
- IMAGE 1: a plus-size female model wearing a garment. KEEP HER EXACTLY: same model, same face, same hair, same skin tone, same pose, same body, same garment shape/cut/details, same beige studio background, same lighting and framing.
- IMAGE 2: the SAME type of garment but in a DIFFERENT color (this photo may be low quality — use it ONLY to read the exact target color/shade).

Generate a new photo IDENTICAL to IMAGE 1 in every way (model, pose, garment, background, lighting), but RECOLOR the garment to match the EXACT color and shade of the garment in IMAGE 2.

CRITICAL: change ONLY the color of the garment. Do NOT change the model, the pose, the cut, the fabric details, the background or anything else. The new color must exactly match the real color/shade shown in IMAGE 2 (pixel-perfect hue). Keep all garment details (straps, buttons, embroidery, seams) identical to IMAGE 1.

Warm sand beige studio background ${FOND}. Realistic, high resolution. No logo, no text, no watermark.

${PEAU}${expo}`;
}

// --- Fonction principale (meme signature que images.js + options recoloration face) ---
export async function genererPhotosProduit(photos, labelCouleur, hexCouleur, dosModele, detailModele, dossierSortie, options = {}) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await fs.mkdir(dossierSortie, { recursive: true });

  const photoAvant = photos.find((p) => p.role === 'avant');
  const photoDos = photos.find((p) => p.role === 'dos');
  const photoDetail = photos.find((p) => p.role === 'detail');

  // Recoloration de face : on garde le mannequin de la face modèle ⭐, on applique la couleur
  // de la photo "avant" de cette couleur. Déclenché par options.recoloriser + options.faceModele.
  const { recoloriser = false, faceModele = null, estHaut = false, garderPose = false } = options;

  const couleur = couleurEn(labelCouleur, hexCouleur);
  const expo = consigneExposition(labelCouleur);
  const profil = profilAleatoire(); // origine + cheveux pour ce produit
  const { poseFace, pose34 } = tirerPoses(estHaut); // 2 poses différentes (assise possible si haut)
  const resultats = {};

  // 1. FACE
  let srcAvant;
  if (recoloriser && faceModele && photoAvant) {
    // Mode recoloration : face modèle ⭐ (mannequin) + photo avant de cette couleur (teinte)
    console.log(`   [openai] FACE (${labelCouleur}) — RECOLORATION du modèle ⭐...`);
    const srcModele = await urlVersFichier(faceModele, dossierSortie, 'face_modele');
    const srcCouleur = await urlVersFichier(photoAvant.url, dossierSortie, 'couleur_cible');
    resultats.face = await genererImage(openai, [srcModele, srcCouleur], promptFaceRecoloree(expo), dossierSortie, 'face');
    srcAvant = resultats.face; // pour les angles suivants, on part de la face recolorée
  } else {
    if (!photoAvant) throw new Error('Aucune photo "avant" fournie.');
    console.log(`   [openai] FACE (${labelCouleur})...`);
    srcAvant = await urlVersFichier(photoAvant.url, dossierSortie, 'avant');
    resultats.face = await genererImage(openai, [srcAvant], promptFace(couleur, expo, profil, poseFace, garderPose), dossierSortie, 'face');
  }

  // 2. DOS — UNIQUEMENT si une vraie photo de dos existe (sinon on saute, pas de dos inventé)
  if (photoDos) {
    try {
      console.log('   [openai] DOS (vraie photo + face)...');
      const srcDos = await urlVersFichier(photoDos.url, dossierSortie, 'dos');
      resultats.dos = await genererImage(openai, [resultats.face, srcDos], promptDos(couleur, expo), dossierSortie, 'dos');
    } catch (err) {
      console.log(`   [openai] ⚠️ DOS échoué (${err.message}) → on continue sans le dos`);
    }
  } else {
    console.log('   [openai] DOS ignoré (pas de photo dos fournie)');
  }

  // 3. 3/4 : face générée (femme) + vraie photo PFS (vêtement complet) pour éviter l'invention.
  // En recoloration, srcAvant = face recolorée → on garde juste la face.
  try {
    const refs34 = recoloriser ? [resultats.face] : [resultats.face, srcAvant];
    console.log('   [openai] 3/4...');
    resultats.troisQuart = await genererImage(openai, refs34, promptTroisQuart(couleur, expo, pose34), dossierSortie, 'troisQuart');
  } catch (err) {
    console.log(`   [openai] ⚠️ 3/4 échoué (${err.message}) → on continue sans le 3/4`);
  }

  // 4. DETAIL — zoom sur le tissu/motif. Si photo détail étiquetée, on part d'elle ;
  // sinon on zoome sur la face générée (le vêtement porté, beau et fidèle).
  try {
    if (photoDetail) {
      console.log('   [openai] DETAIL (zoom sur la photo détail étiquetée)...');
      const srcDet = await urlVersFichier(photoDetail.url, dossierSortie, 'detail');
      resultats.detail = await genererImage(openai, [srcDet], promptDetail(couleur, expo), dossierSortie, 'detail');
    } else {
      console.log('   [openai] DETAIL (zoom sur la face générée)...');
      resultats.detail = await genererImage(openai, [resultats.face], promptDetail(couleur, expo), dossierSortie, 'detail');
    }
  } catch (err) {
    console.log(`   [openai] ⚠️ DETAIL échoué (${err.message}) → on continue sans le détail`);
  }

  return resultats;
}