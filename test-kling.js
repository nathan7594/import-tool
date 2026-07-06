// test-kling.js
// Test de génération d'une vidéo à partir d'une image, via l'API Kling (v3.0).
// Usage : node test-kling.js <chemin_image>
//   ex : node test-kling.js sortie-import/xxxxx/Bleu/face.png
// Nécessite KLING_API_KEY dans le .env (package API Kling actif).

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';

const API_KEY = process.env.KLING_API_KEY;
const BASE = process.env.KLING_API_BASE || 'https://api-singapore.klingai.com';

// Réglages (comme décidé : Kling 3.0, 720p, 9:16 vertical, 5s, sans son)
const MODELE = 'kling-v3';       // Kling 3.0
const RESOLUTION = '720p';
const RATIO = '9:16';
const DUREE = '5';               // secondes (string attendu par l'API)

const PROMPT = `Animate the woman from the source image into a professional fashion e-commerce video. She moves gently and elegantly to showcase the outfit: she shifts her weight naturally, turns her upper body slightly from side to side, and lets one hand softly glide along the fabric. Her hair sways subtly with the movement. Soft natural facial expression, calm and confident, a gentle smile. The camera stays steady at eye level. Warm sand beige studio background, soft studio lighting, smooth realistic motion.

CRITICAL: it must be the EXACT SAME woman as in the source image, keep her face, her hair, her skin tone, her body and her identity perfectly identical. Do NOT replace her with a different person, do NOT change her face or morph her features.

CRITICAL: keep the garment exactly identical to the source image (same cut, same color, same pattern, same details), do not change, deform or restyle the clothing. No morphing, no extra objects, no text, no added accessories.`;

const NEGATIF = 'different woman, face change, morphing, deformed clothing, changed outfit, extra objects, text, watermark, logo, blurry, distorted';

// Petite pause
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!API_KEY) {
    console.error('❌ KLING_API_KEY manquante dans le .env');
    process.exit(1);
  }
  const imgPath = process.argv[2];
  if (!imgPath) {
    console.error('❌ Donne le chemin d\'une image : node test-kling.js <chemin_image>');
    process.exit(1);
  }

  // 1. Lire l'image et la convertir en base64
  console.log(`📷 Image : ${imgPath}`);
  const buffer = await fs.readFile(imgPath);
  const base64 = buffer.toString('base64');
  console.log(`   (${Math.round(buffer.length / 1024)} Ko)`);

  // 2. Créer la tâche image→vidéo
  console.log(`\n🎬 Envoi à Kling (${MODELE}, ${RESOLUTION}, ${RATIO}, ${DUREE}s, sans son)...`);
  const creation = await fetch(`${BASE}/v1/videos/image2video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model_name: MODELE,
      image: base64,
      prompt: PROMPT,
      negative_prompt: NEGATIF,
      duration: DUREE,
      aspect_ratio: RATIO,
      resolution: RESOLUTION,
      // pas d'audio
    }),
  });

  const creationData = await creation.json();
  if (!creation.ok || creationData.code !== 0) {
    console.error('❌ Erreur création tâche :', JSON.stringify(creationData, null, 2));
    process.exit(1);
  }

  const taskId = creationData.data.task_id;
  console.log(`✅ Tâche créée : ${taskId}`);
  console.log('⏳ Génération en cours (1 à 5 min)...\n');

  // 3. Interroger le statut jusqu'à ce que ce soit prêt
  let videoUrl = null;
  for (let i = 0; i < 60; i++) { // max ~10 min (60 × 10s)
    await pause(10000); // 10s entre chaque vérif
    const check = await fetch(`${BASE}/v1/videos/image2video/${taskId}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    const checkData = await check.json();
    if (checkData.code !== 0) {
      console.error('❌ Erreur statut :', JSON.stringify(checkData, null, 2));
      process.exit(1);
    }
    const status = checkData.data.task_status;
    process.stdout.write(`   [${i + 1}] statut : ${status}\n`);

    if (status === 'succeed') {
      videoUrl = checkData.data.task_result.videos[0].url;
      break;
    }
    if (status === 'failed') {
      console.error('❌ Génération échouée :', JSON.stringify(checkData.data, null, 2));
      process.exit(1);
    }
  }

  if (!videoUrl) {
    console.error('❌ Timeout : la vidéo n\'est pas prête après 10 min.');
    process.exit(1);
  }

  // 4. Télécharger la vidéo
  console.log(`\n✅ Vidéo prête : ${videoUrl}`);
  const videoRep = await fetch(videoUrl);
  const videoBuffer = Buffer.from(await videoRep.arrayBuffer());
  const sortie = path.join(process.cwd(), 'test-video-kling.mp4');
  await fs.writeFile(sortie, videoBuffer);
  console.log(`💾 Enregistrée : ${sortie} (${Math.round(videoBuffer.length / 1024)} Ko)`);
  console.log('\n🎉 Terminé ! Ouvre test-video-kling.mp4 pour voir le résultat.');
}

main().catch((err) => {
  console.error('❌ Erreur :', err.message);
  process.exit(1);
});