// services/video.js
// Génère une vidéo produit à partir d'une image (face), via Kling AI (v3.0),
// la compresse avec FFmpeg (légère, web), puis l'uploade comme FICHIER Shopify
// et renvoie l'ID du fichier (pour le mettre dans le metafield custom.video).

import fs from 'fs/promises';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { shopifyGraphQL } from './shopify-auth.js';

ffmpeg.setFfmpegPath(ffmpegPath);

const API_KEY = process.env.KLING_API_KEY;
const BASE = process.env.KLING_API_BASE || 'https://api-singapore.klingai.com';

// Réglages vidéo (décidés : Kling 3.0, 720p, 9:16 vertical, 5s, sans son)
const MODELE = 'kling-v3';
const RESOLUTION = '720p';
const RATIO = '9:16';
const DUREE = '5';

const PROMPT = `Animate the woman from the source image into a professional fashion e-commerce video. She moves gently and elegantly to showcase the outfit: she shifts her weight naturally, turns her upper body slightly from side to side, and lets one hand softly glide along the fabric. Her hair sways subtly with the movement. Soft natural facial expression, calm and confident, a gentle smile. The camera stays steady at eye level. Warm sand beige studio background, soft studio lighting, smooth realistic motion.

CRITICAL: it must be the EXACT SAME woman as in the source image, keep her face, her hair, her skin tone, her body and her identity perfectly identical. Do NOT replace her with a different person, do NOT change her face or morph her features.

CRITICAL: keep the garment exactly identical to the source image (same cut, same color, same pattern, same details), do not change, deform or restyle the clothing. No morphing, no extra objects, no text, no added accessories.`;

const NEGATIF = 'different woman, face change, morphing, deformed clothing, changed outfit, extra objects, text, watermark, logo, blurry, distorted';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 1. Génère la vidéo via Kling, renvoie le chemin du .mp4 brut téléchargé ───
async function genererVideoKling(cheminImage, dossierSortie) {
  if (!API_KEY) throw new Error('KLING_API_KEY manquante');

  const buffer = await fs.readFile(cheminImage);
  const base64 = buffer.toString('base64');

  // Créer la tâche
  const creation = await fetch(`${BASE}/v1/videos/image2video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model_name: MODELE, image: base64, prompt: PROMPT, negative_prompt: NEGATIF,
      duration: DUREE, aspect_ratio: RATIO, resolution: RESOLUTION,
    }),
  });
  const creationData = await creation.json();
  if (!creation.ok || creationData.code !== 0) {
    throw new Error(`Kling création : ${JSON.stringify(creationData)}`);
  }
  const taskId = creationData.data.task_id;
  console.log(`   [kling] tâche créée : ${taskId} (génération 1-5 min)`);

  // Attendre le résultat
  let videoUrl = null;
  for (let i = 0; i < 60; i++) {
    await pause(10000);
    const check = await fetch(`${BASE}/v1/videos/image2video/${taskId}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    const checkData = await check.json();
    if (checkData.code !== 0) throw new Error(`Kling statut : ${JSON.stringify(checkData)}`);
    const status = checkData.data.task_status;
    if (status === 'succeed') { videoUrl = checkData.data.task_result.videos[0].url; break; }
    if (status === 'failed') throw new Error(`Kling échec : ${JSON.stringify(checkData.data)}`);
  }
  if (!videoUrl) throw new Error('Kling timeout (10 min)');

  // Télécharger la vidéo brute
  const rep = await fetch(videoUrl);
  const videoBuffer = Buffer.from(await rep.arrayBuffer());
  const cheminBrut = path.join(dossierSortie, 'video-brute.mp4');
  await fs.writeFile(cheminBrut, videoBuffer);
  console.log(`   [kling] vidéo téléchargée (${Math.round(videoBuffer.length / 1024)} Ko)`);
  return cheminBrut;
}

// ─── 2. Compresse la vidéo avec FFmpeg (H.264, web-optimisé) ───
function compresserVideo(cheminEntree, cheminSortie) {
  return new Promise((resolve, reject) => {
    ffmpeg(cheminEntree)
      .videoCodec('libx264')
      .outputOptions([
        '-crf 20',              // qualité élevée (20 = très proche de l'original)
        '-preset slower',       // compression optimale, préserve mieux les détails
        '-movflags +faststart', // lecture web rapide
        '-pix_fmt yuv420p',     // compatibilité navigateurs
        '-an',                  // pas d'audio
      ])
      .on('end', () => resolve(cheminSortie))
      .on('error', (err) => reject(new Error(`FFmpeg : ${err.message}`)))
      .save(cheminSortie);
  });
}

// ─── 3. Uploade la vidéo comme FICHIER Shopify, renvoie l'ID du fichier ───
async function uploaderFichierVideo(cheminVideo, nomFichier, altText) {
  const buffer = await fs.readFile(cheminVideo);

  // a. URL d'upload temporaire (resource VIDEO)
  const staged = await shopifyGraphQL(`
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `, {
    input: [{ filename: nomFichier, mimeType: 'video/mp4', httpMethod: 'POST', resource: 'VIDEO', fileSize: String(buffer.length) }],
  });
  const target = staged.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error('staged upload vidéo échoué');

  // b. Envoyer le fichier
  const form = new FormData();
  target.parameters.forEach((p) => form.append(p.name, p.value));
  form.append('file', new Blob([buffer]), nomFichier);
  const up = await fetch(target.url, { method: 'POST', body: form });
  if (!up.ok && up.status !== 201 && up.status !== 204) throw new Error(`upload vidéo : ${up.status}`);

  // c. Créer le fichier dans Shopify (fileCreate) → renvoie l'ID
  const fileCreate = await shopifyGraphQL(`
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus alt ... on Video { id } }
        userErrors { field message }
      }
    }
  `, {
    files: [{ originalSource: target.resourceUrl, contentType: 'VIDEO', alt: altText }],
  });
  const errFile = fileCreate.fileCreate?.userErrors || [];
  if (errFile.length) throw new Error(`fileCreate : ${JSON.stringify(errFile)}`);
  const fileId = fileCreate.fileCreate?.files?.[0]?.id;
  console.log(`   [shopify] fichier vidéo créé : ${fileId}`);
  return fileId;
}

// ─── Fonction principale : image → vidéo Kling → upload fichier (sans recompression) ───
// Renvoie l'ID du fichier vidéo Shopify (pour metafield custom.video), ou null si échec.
// NB : on n'ajoute PAS de compression FFmpeg — Shopify réencode/optimise déjà les vidéos
// à l'upload, donc recompresser dégraderait la qualité pour rien (double compression).
export async function genererEtUploaderVideo(cheminImageFace, dossierSortie) {
  try {
    console.log('   [video] génération Kling...');
    const brut = await genererVideoKling(cheminImageFace, dossierSortie);
    const taille = (await fs.stat(brut)).size;
    console.log(`   [video] vidéo Kling (${Math.round(taille / 1024)} Ko), upload direct (qualité max)`);

    console.log('   [video] upload vers Shopify...');
    const fileId = await uploaderFichierVideo(
      brut,
      'video-mannequin-grande-taille.mp4',
      'Vidéo mannequin vêtement femme grande taille'
    );
    return fileId;
  } catch (err) {
    console.log(`   [video] ⚠️ échec : ${err.message} (on continue sans vidéo)`);
    return null;
  }
}