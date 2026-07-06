// test-seo.js
// Teste la génération SEO (Claude), sans Shopify.
// Teste 2 cas : description RICHE (texte seul) + description PAUVRE (avec photo).
// Usage : node test-seo.js

import 'dotenv/config';
import { genererSEO } from './src/services/seo.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n  ANTHROPIC_API_KEY manquante dans .env\n');
  process.exit(1);
}

function afficher(titre, r) {
  console.log('\n  ══════════════════════════════════════');
  console.log(`  CAS : ${titre}`);
  console.log(`  Photo envoyée à Claude : ${r.photoUtilisee ? 'OUI' : 'non'}`);
  console.log('  ══════════════════════════════════════');
  console.log('  TITRE :', r.titre, `(${r.titre.length} car.)`);
  console.log('  META  :', r.metaDescription, `(${r.metaDescription.length} car.)`);
  console.log('  ALT   :', r.altImages);
  console.log('  DESCRIPTION HTML :\n');
  console.log(r.descriptionHtml);
  console.log('\n  ───── ATOUTS (3 catégories fixes) ─────\n');
  console.log(`  [INTRO]     ${r.atoutsIntro}\n`);
  console.log(`  [1·STYLE]   ${r.atout1Titre}\n              ${r.atout1Texte}\n`);
  console.log(`  [2·MATIÈRE] ${r.atout2Titre}\n              ${r.atout2Texte}\n`);
  console.log(`  [3·DÉTAIL]  ${r.atout3Titre}\n              ${r.atout3Texte}`);
  console.log('\n  ───── COMPOSITION ─────\n');
  console.log('  ' + (r.compositionHtml || '(vide)'));
  console.log('\n  ───── AVIS CLIENT ─────\n');
  console.log(`  ${r.avisNom} — ${r.avisDate}`);
  console.log(`  "${r.avisTexte}"`);
  const cout = (r.inputTokens / 1e6) * 3 + (r.outputTokens / 1e6) * 15;
  console.log(`\n  Tokens : ${r.inputTokens} in / ${r.outputTokens} out — ~${cout.toFixed(4)}$`);
}

// CAS 1 : description RICHE (texte seul, pas de photo)
const produitRiche = {
  titre: 'Tunique longue col bardot broderie anglaise – non doublée (TU)',
  categorie: 'Femme Tuniques',
  description: 'Tunique longue en coton léger col bardot effet bi-matière : broderie anglaise ajourée sur le devant et dos en coton toucher lin. Manches courtes légèrement festonnées. Coupe ample décontractée : col élastiqué pouvant être porté sur les épaules ou en version col bardot.',
  composition: 'Coton (100%)',
  collection: 'Printemps/Été 2026',
  couleurs: ['Marron', 'Noir', 'Blanc', 'Beige'],
  tailles: ['46', '48', '50', '52', '54', '56', '58', '60'],
};

// CAS 2 : description PAUVRE (déclenche l'envoi de la photo)
const produitPauvre = {
  titre: 'Top à fines bretelles dorées',
  categorie: 'Femme Tops',
  description: 'Hauts simple avec un petit décor les bretelles en dorée',
  composition: 'Polyester (40%), Viscose (55%), Elastane (5%)',
  collection: 'Printemps/Été 2026',
  couleurs: ['Kaki', 'Noir'],
  tailles: ['46', '48', '50', '52', '54', '56', '58', '60'],
  // photo accessible publiquement pour le test (PFS bloque les serveurs avec 403,
  // mais dans le vrai outil l'extension lit l'image dans le navigateur)
  urlPhoto: 'https://cdn.shopify.com/s/files/1/0954/3100/0388/files/tup0564g-1_8584f491-154a-4da9-b7e3-ec3dfe44c5ac.webp?v=1776192306',
};

console.log('\n  Test génération SEO (Claude) — 2 cas\n');

try {
  const r1 = await genererSEO(produitRiche);
  afficher('Description RICHE (tunique)', r1);

  const r2 = await genererSEO(produitPauvre);
  afficher('Description PAUVRE → photo (top bretelles)', r2);
  console.log('');
} catch (err) {
  console.error('\n  ❌ Erreur :', err.message, '\n');
  process.exit(1);
}