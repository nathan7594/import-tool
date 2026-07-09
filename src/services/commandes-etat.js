// services/commandes-etat.js
// Sauvegarde l'état "acheté" de chaque vente (par id unique orderName::lineItemId).
// Fichier disque -> permanent, réversible (on peut décocher).

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOSSIER = join(__dirname, '..', '..', 'data');
const FICHIER = join(DOSSIER, 'commandes-etat.json');

// { "id de vente": true }  => acheté. Absent ou false => à acheter.
export async function lireEtats() {
  try {
    if (!existsSync(FICHIER)) return {};
    return JSON.parse(await readFile(FICHIER, 'utf8'));
  } catch {
    return {};
  }
}

// Cocher/décocher un ou plusieurs ids
export async function setEtat(ids, achete) {
  try {
    if (!existsSync(DOSSIER)) await mkdir(DOSSIER, { recursive: true });
    const etats = await lireEtats();
    for (const id of ids) {
      if (achete) etats[id] = true;
      else delete etats[id];
    }
    await writeFile(FICHIER, JSON.stringify(etats, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[commandes-etat] erreur :', err.message);
    return false;
  }
}