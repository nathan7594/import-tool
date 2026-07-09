// services/fournisseurs-info.js
// Adresse + téléphone de chaque fournisseur, éditables depuis la page.
// Fichier disque -> permanent.

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOSSIER = join(__dirname, '..', '..', 'data');
const FICHIER = join(DOSSIER, 'fournisseurs.json');

// { "DL CREATION": { adresse: "...", telephone: "..." } }
export async function lireFournisseurs() {
  try {
    if (!existsSync(FICHIER)) return {};
    return JSON.parse(await readFile(FICHIER, 'utf8'));
  } catch {
    return {};
  }
}

export async function setFournisseur(nom, adresse, telephone) {
  try {
    if (!existsSync(DOSSIER)) await mkdir(DOSSIER, { recursive: true });
    const all = await lireFournisseurs();
    all[nom] = { adresse: adresse || '', telephone: telephone || '' };
    await writeFile(FICHIER, JSON.stringify(all, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[fournisseurs-info] erreur :', err.message);
    return false;
  }
}