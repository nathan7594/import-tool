// services/file-attente.js
// File d'attente simple : on empile des produits, on les traite UN PAR UN en arrière-plan.
// Permet d'enchaîner les imports sans attendre (la modale se ferme tout de suite).

let file = [];          // produits en attente
let enCours = null;     // produit en cours de traitement
let historique = [];    // produits terminés (succès ou erreur), 20 derniers
let traitementActif = false;
let compteur = 0;

// La fonction qui traite réellement un produit (injectée depuis import.js)
let traiteur = null;
export function definirTraiteur(fn) { traiteur = fn; }

// Ajouter un produit à la file
export function ajouterFile(paquet) {
  compteur += 1;
  const tache = {
    id: compteur,
    titre: paquet.titre || `Produit ${compteur}`,
    paquet,
    statut: 'en_attente',
    ajouteLe: new Date().toISOString(),
  };
  file.push(tache);
  lancerTraitement(); // démarre si pas déjà en cours
  return tache.id;
}

// Boucle de traitement (un par un)
async function lancerTraitement() {
  if (traitementActif) return; // déjà en train de tourner
  traitementActif = true;

  while (file.length > 0) {
    const tache = file.shift();
    enCours = { id: tache.id, titre: tache.titre, statut: 'en_cours', debut: new Date().toISOString() };

    try {
      if (!traiteur) throw new Error('Aucun traiteur défini');
      const resultat = await traiteur(tache.paquet);
      historique.unshift({ id: tache.id, titre: tache.titre, statut: 'fini', ...resultat, fini: new Date().toISOString() });
      console.log(`[file] ✅ #${tache.id} "${tache.titre}" terminé`);
    } catch (err) {
      historique.unshift({ id: tache.id, titre: tache.titre, statut: 'erreur', erreur: err.message, fini: new Date().toISOString() });
      console.log(`[file] ❌ #${tache.id} "${tache.titre}" : ${err.message}`);
    }

    if (historique.length > 20) historique = historique.slice(0, 20);
    enCours = null;
  }

  traitementActif = false;
}

// État de la file (pour l'affichage)
export function etatFile() {
  return {
    enAttente: file.map((t) => ({ id: t.id, titre: t.titre })),
    enCours,
    historique,
    resume: {
      attente: file.length,
      enCours: enCours ? 1 : 0,
      finis: historique.filter((h) => h.statut === 'fini').length,
      erreurs: historique.filter((h) => h.statut === 'erreur').length,
    },
  };
}