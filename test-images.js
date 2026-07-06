// test-images.js
// Teste la brique images avec la signature actuelle.
//
// Usage : node test-images.js "https://url-avant.jpg" ["https://url-dos.jpg"]

import 'dotenv/config';
import { genererPhotosProduit } from './src/services/images.js';

const urlAvant = process.argv[2];
const urlDos = process.argv[3]; // optionnel

if (!urlAvant) {
  console.error('\n  Usage : node test-images.js "https://url-avant.jpg" ["https://url-dos.jpg"]\n');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('\n  GEMINI_API_KEY manquante dans .env\n');
  process.exit(1);
}

const photos = [{ url: urlAvant, role: 'avant' }];
if (urlDos) photos.push({ url: urlDos, role: 'dos' });

console.log('\n  Test brique images');
console.log('  Avant :', urlAvant);
console.log('  Dos   :', urlDos || '(deduit depuis la face)');
console.log('  Generation en cours (30-90 s)...\n');

try {
  // signature : (photos, labelCouleur, hexCouleur, dosModele, detailModele, dossierSortie)
  const resultats = await genererPhotosProduit(
    photos,
    'Marron',          // labelCouleur
    '#654321',         // hexCouleur
    null,              // dosModele
    null,              // detailModele
    './sortie-test'    // dossierSortie
  );
  console.log('\n  Termine. Images generees :');
  for (const [angle, fichier] of Object.entries(resultats)) {
    console.log(`     - ${angle.padEnd(12)} ${fichier}`);
  }
  console.log('\n  Ouvre le dossier sortie-test/ pour les voir.\n');
} catch (err) {
  console.error('\n  Erreur :', err.message, '\n');
  process.exit(1);
}