// test-video-shopify.js
// Test : uploade une vidéo (test-video-kling.mp4) sur un produit Shopify EXISTANT,
// en 1ère position de la galerie, pour voir comment le thème réagit
// (image de variante, vignette de collection, galerie).
//
// Usage : node test-video-shopify.js <product_id> [chemin_video]
//   ex : node test-video-shopify.js 15639794745670
//   (par défaut la vidéo = test-video-kling.mp4 à la racine)

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { shopifyGraphQL } from './src/services/shopify-auth.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Upload d'une vidéo vers Shopify (staged upload en resource VIDEO)
async function uploaderVideo(cheminLocal) {
  const buffer = await fs.readFile(cheminLocal);
  const nom = path.basename(cheminLocal);
  console.log(`📤 Upload de ${nom} (${Math.round(buffer.length / 1024)} Ko)...`);

  // 1. URL d'upload temporaire (resource VIDEO)
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
      mimeType: 'video/mp4',
      httpMethod: 'POST',
      resource: 'VIDEO',
      fileSize: String(buffer.length),
    }],
  });

  const errStaged = staged.stagedUploadsCreate?.userErrors || [];
  if (errStaged.length) { console.error('❌ staged errors:', errStaged); return null; }
  const target = staged.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) { console.error('❌ pas de cible d\'upload'); return null; }

  // 2. Envoyer le fichier
  const form = new FormData();
  target.parameters.forEach((p) => form.append(p.name, p.value));
  form.append('file', new Blob([buffer]), nom);
  const up = await fetch(target.url, { method: 'POST', body: form });
  if (!up.ok && up.status !== 201 && up.status !== 204) {
    console.error('❌ upload échoué:', up.status);
    return null;
  }
  console.log('✅ Fichier uploadé sur le stockage temporaire.');
  return target.resourceUrl;
}

async function main() {
  const productIdNum = process.argv[2];
  const cheminVideo = process.argv[3] || path.join(process.cwd(), 'test-video-kling.mp4');

  if (!productIdNum) {
    console.error('❌ Donne l\'ID du produit : node test-video-shopify.js <product_id>');
    console.error('   (l\'ID est le nombre dans l\'URL admin du produit)');
    process.exit(1);
  }

  // Vérifier que la vidéo existe
  try { await fs.access(cheminVideo); }
  catch { console.error(`❌ Vidéo introuvable : ${cheminVideo}`); process.exit(1); }

  const productGid = `gid://shopify/Product/${productIdNum}`;
  console.log(`🎯 Produit : ${productGid}`);

  // 1. Uploader la vidéo
  const resourceUrl = await uploaderVideo(cheminVideo);
  if (!resourceUrl) process.exit(1);

  // 2. Attacher la vidéo au produit
  console.log('🎬 Association de la vidéo au produit...');
  const create = await shopifyGraphQL(`
    mutation createMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id status ... on Video { id } }
        mediaUserErrors { field message }
      }
    }
  `, {
    productId: productGid,
    media: [{ originalSource: resourceUrl, mediaContentType: 'VIDEO', alt: 'Vidéo produit' }],
  });

  const errCreate = create.productCreateMedia?.mediaUserErrors || [];
  if (errCreate.length) { console.error('❌ media errors:', errCreate); process.exit(1); }
  const mediaId = create.productCreateMedia?.media?.[0]?.id;
  console.log(`✅ Vidéo associée (media: ${mediaId}). Elle se traite côté Shopify (encodage).`);

  // 3. Déplacer la vidéo en 1ère position
  console.log('↕️  Déplacement de la vidéo en 1ère position...');
  await pause(3000);
  const reorder = await shopifyGraphQL(`
    mutation reorder($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        job { id }
        userErrors { field message }
      }
    }
  `, {
    id: productGid,
    moves: [{ id: mediaId, newPosition: '0' }],
  });
  const errReorder = reorder.productReorderMedia?.userErrors || [];
  if (errReorder.length) console.log('⚠️ reorder:', errReorder, '(pas grave, la vidéo est quand même ajoutée)');
  else console.log('✅ Vidéo placée en 1ère position.');

  console.log('\n🎉 Terminé !');
  console.log('👉 Va voir le produit sur ta boutique et vérifie :');
  console.log('   1. La vidéo s\'affiche-t-elle dans la galerie (en 1er) ?');
  console.log('   2. L\'image de variante (quand tu changes de couleur) est-elle toujours correcte ?');
  console.log('   3. La vignette dans la collection est-elle toujours une photo (pas la vidéo) ?');
  console.log('   (l\'encodage de la vidéo par Shopify peut prendre 1-2 min avant affichage)');
}

main().catch((err) => { console.error('❌ Erreur :', err.message); process.exit(1); });