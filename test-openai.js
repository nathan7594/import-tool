// test-openai.js
// Teste UNIQUEMENT la generation d'images OpenAI (GPT Image 2), sans Shopify.
// Usage : node test-openai.js "https://url-avant.jpg" ["https://url-dos.jpg"]

import 'dotenv/config';
import { genererPhotosProduit } from './src/services/images-openai.js';

const urlAvant = process.argv[2];
const urlDos = process.argv[3];

if (!urlAvant) {
  console.error('\n  Usage : node test-openai.js "url-avant" ["url-dos"]\n');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('\n  OPENAI_API_KEY manquante dans .env\n');
  process.exit(1);
}

const photos = [{ url: urlAvant, role: 'avant' }];
if (urlDos) photos.push({ url: urlDos, role: 'dos' });

console.log('\n  Test GPT Image 2 (OpenAI)');
console.log('  Avant :', urlAvant);
console.log('  Dos   :', urlDos || '(depuis la face)');
console.log('  Generation en cours...\n');

try {
  const r = await genererPhotosProduit(photos, 'Marron', '#654321', null, null, './sortie-openai');
  console.log('\n  ✅ Termine. Images dans ./sortie-openai/ :');
  for (const [k, v] of Object.entries(r)) console.log(`     - ${k.padEnd(12)} ${v}`);
  console.log('');
} catch (err) {
  console.error('\n  ❌ Erreur :', err.message, '\n');
  process.exit(1);
}