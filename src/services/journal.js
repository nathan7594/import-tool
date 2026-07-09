// services/journal.js
// Journal des actions du check, sauvegardé dans un FICHIER sur le disque.
// Survit aux redémarrages, fermeture de Chrome, etc. (contrairement à la mémoire).
//
// Format : un fichier JSON qui contient un tableau d'entrées.
// Chaque entrée = un run de check avec ce qui a été fait.

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Fichier stocké à la racine du backend, dossier "data"
const DOSSIER = join(__dirname, '..', '..', 'data');
const FICHIER = join(DOSSIER, 'historique.json');

// Limite : on garde les 1000 derniers runs (évite que le fichier grossisse à l'infini)
const MAX_ENTREES = 1000;

// ─────────────────────────────────────────────────────────────
// Lire tout l'historique (tableau, le plus récent en premier)
// ─────────────────────────────────────────────────────────────
export async function lireJournal() {
  try {
    if (!existsSync(FICHIER)) return [];
    const txt = await readFile(FICHIER, 'utf8');
    return JSON.parse(txt);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Ajouter une entrée au journal
//   entree = {
//     date: ISO string,
//     mode: 'simulation' | 'reel',
//     totalVerifies: number,
//     actions: [ { produit, changements: [{couleur, vers, nb}] } ],
//     alerte: bool,
//   }
// ─────────────────────────────────────────────────────────────
export async function ajouterEntree(entree) {
  try {
    if (!existsSync(DOSSIER)) await mkdir(DOSSIER, { recursive: true });
    const journal = await lireJournal();
    // ajoute en tête (plus récent en premier)
    journal.unshift({ date: new Date().toISOString(), ...entree });
    // tronque
    const tronque = journal.slice(0, MAX_ENTREES);
    await writeFile(FICHIER, JSON.stringify(tronque, null, 2), 'utf8');
  } catch (err) {
    console.error('[journal] Erreur écriture :', err.message);
  }
}