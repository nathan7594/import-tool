// test-recolor-face.js
// Teste la recoloration d'une FACE : on garde le BON mannequin d'une couleur,
// et on applique la VRAIE couleur d'une autre photo (même moche).
//
// Usage : node test-recolor-face.js "URL_BONNE_FACE" "URL_PHOTO_COULEUR_CIBLE"
//   - URL_BONNE_FACE  = la belle photo (ex: jaune) -> sert pour le mannequin/pose
//   - URL_PHOTO_COULEUR_CIBLE = la photo de la couleur voulue (ex: bordeaux) -> sert pour la couleur

import 'dotenv/config';
import OpenAI, { toFile } from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';

const urlBonneFace = process.argv[2];
const urlCouleurCible = process.argv[3];

if (!urlBonneFace || !urlCouleurCible) {
  console.error('\n  Usage : node test-recolor-face.js "URL_BONNE_FACE" "URL_PHOTO_COULEUR_CIBLE"\n');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('\n  OPENAI_API_KEY manquante dans .env\n');
  process.exit(1);
}

const FOND = '#EDE7DD';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Prompt de recoloration : IMAGE 1 = mannequin à garder, IMAGE 2 = couleur à appliquer
function promptRecolorFace() {
  return `You are given TWO reference images:
- IMAGE 1: a plus-size female model wearing a garment. KEEP HER EXACTLY: same model, same face, same hair, same skin tone, same pose, same body, same garment shape/cut/details, same beige studio background, same lighting and same framing.
- IMAGE 2: the SAME garment but in a DIFFERENT color (the photo may be low quality — use it ONLY to read the exact target color/shade).

Generate a new photo IDENTICAL to IMAGE 1 in every way (model, pose, garment, background, lighting), but RECOLOR the garment to match the EXACT color and shade of the garment in IMAGE 2.

CRITICAL: change ONLY the color of the garment. Do NOT change the model, the pose, the cut, the fabric details, the background or anything else. The new color must exactly match the real color/shade shown in IMAGE 2 (pixel-perfect hue). Keep all garment details (straps, buttons, embroidery, seams) identical to IMAGE 1.

Warm sand beige studio background ${FOND}. Realistic, high resolution, natural skin tone (not orange). No logo, no text, no watermark.`;
}

async function urlVersFichier(url, nom) {
  const rep = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      'Referer': 'https://parisfashionshops.com/',
    },
  });
  if (!rep.ok) throw new Error(`Téléchargement échoué (${rep.status}) pour ${nom}`);
  const buffer = Buffer.from(await rep.arrayBuffer());
  const ext = (rep.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg';
  const fichier = path.join('./sortie-recolor', `_src_${nom}.${ext}`);
  await fs.mkdir('./sortie-recolor', { recursive: true });
  await fs.writeFile(fichier, buffer);
  return fichier;
}

console.log('\n  Test recoloration de face (mannequin + vraie couleur)');
console.log('  Bonne face   :', urlBonneFace);
console.log('  Couleur cible:', urlCouleurCible);
console.log('  Génération...\n');

try {
  const f1 = await urlVersFichier(urlBonneFace, 'bonne_face');
  const f2 = await urlVersFichier(urlCouleurCible, 'couleur_cible');

  const images = [];
  for (const f of [f1, f2]) {
    const buffer = await fs.readFile(f);
    const type = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const nom = path.basename(f);
    images.push(await toFile(buffer, nom, { type }));
  }

  const rep = await openai.images.edit({
    model: 'gpt-image-2',
    image: images,
    prompt: promptRecolorFace(),
    size: '1024x1536',
  });

  const b64 = rep.data[0].b64_json;
  const fichier = path.join('./sortie-recolor', 'face_recoloree.png');
  await fs.writeFile(fichier, Buffer.from(b64, 'base64'));

  console.log('  ✅ Terminé !');
  console.log('  Résultat : ./sortie-recolor/face_recoloree.png');
  console.log('  Compare avec la bonne face d\'origine pour voir si le mannequin est gardé');
  console.log('  et la couleur bien appliquée.\n');
} catch (err) {
  console.error('\n  ❌ Erreur :', err.message, '\n');
  process.exit(1);
}