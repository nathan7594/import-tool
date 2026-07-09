// services/pfs-parser.js
// Analyse le HTML BRUT d'une page produit PFS (celui renvoyé par fetch same-origin,
// PAS le DOM rendu) et renvoie un verdict structuré sur la disponibilité.
//
// Deux niveaux de décision :
//   - le produit existe-t-il encore ? (redirection vers /categorie/ = mort)
//   - s'il existe : état du stock par variante (normal / stock faible / rupture)
//
// Le parser NE FAIT AUCUN appel réseau et NE MODIFIE RIEN : il lit, il juge, il renvoie.
// C'est volontaire — on peut le tester tout seul avec un bout de HTML, sans Shopify ni PFS.

// ─────────────────────────────────────────────────────────────
// Fonction principale
//   html       : le texte HTML brut renvoyé par fetch(url).then(r => r.text())
//   urlFinale  : r.url APRÈS redirections (fetch la suit tout seul avec redirect:'follow')
// ─────────────────────────────────────────────────────────────
export function analyserPage(html, urlFinale) {
  // ── 1. LE PRODUIT EXISTE-T-IL ENCORE ? ──
  // Un produit retiré chez PFS redirige vers la page catégorie.
  // Deux signaux qui doivent être d'accord :
  //   a) l'URL finale ne contient plus /produit/
  //   b) le titre produit a disparu du HTML
  const urlOK = typeof urlFinale === 'string' && urlFinale.includes('/produit/');
  const titrePresent = /class="product-title"/.test(html);

  // Mort dès qu'un des deux signaux tombe (prudent : on préfère un faux "vivant"
  // qu'un faux "mort" — mais ici les deux se recoupent presque toujours).
  if (!urlOK || !titrePresent) {
    return {
      vivant: false,
      raison: !urlOK ? 'redirection' : 'titre_absent',
      urlFinale: urlFinale || null,
      variantes: [],
    };
  }

  // ── 2. LE PRODUIT EST LÀ : on lit le stock par variante ──
  const variantes = lireVariantes(html);

  // Résumé pratique pour la décision côté backend
  const toutesRupture = variantes.length > 0 && variantes.every((v) => v.etat === 'rupture');

  return {
    vivant: true,
    urlFinale,
    variantes,          // [{ couleurs:[...], etat:..., reste:Number|null, type:'piece'|'pack' }]
    toutesRupture,      // true => le produit entier peut passer en brouillon
  };
}

// ─────────────────────────────────────────────────────────────
// Découpe le HTML en blocs variant-item et lit l'état de chacun.
// On travaille sur le texte brut : on isole chaque variant-item, puis dedans
// on lit sa classe (low-stock / no-stock), son "Reste X", et ses couleurs.
// ─────────────────────────────────────────────────────────────
function lireVariantes(htmlComplet) {
  const variantes = [];

  // On BORNE d'abord à la section des variantes.
  // Sans ça, le dernier variant-item "aspire" tout le HTML restant (dont la color-bar
  // du bas de page) et ramasse des dizaines de couleurs fantômes.
  const start = htmlComplet.indexOf('variants-global-cont');
  const end = htmlComplet.indexOf('product-cta-addtocart-favorite');
  const html = start === -1
    ? htmlComplet
    : htmlComplet.slice(start, end > start ? end : undefined);

  // On repère chaque ouverture de variant-item et on prend le morceau jusqu'à la suivante.
  // (Découpe simple par position : robuste même si le HTML est très imbriqué.)
  const ouvertures = [...html.matchAll(/<div class="(variant-item[^"]*)"/g)];

  for (let i = 0; i < ouvertures.length; i++) {
    const debut = ouvertures[i].index;
    const fin = i + 1 < ouvertures.length ? ouvertures[i + 1].index : html.length;
    const bloc = html.slice(debut, fin);
    const classe = ouvertures[i][1]; // ex: "variant-item low-stock"

    // État depuis la classe du variant-item
    let etat = 'normal';
    if (/\bno-stock\b/.test(classe)) etat = 'rupture';
    else if (/\blow-stock\b/.test(classe)) etat = 'faible';

    // Secours : parfois la rupture est marquée par le texte "En rupture de stock"
    if (etat === 'normal' && /out-of-stock|En rupture de stock/.test(bloc)) {
      etat = 'rupture';
    }

    // Nombre restant, si "Reste X pièce(s)" OU "Reste X pack(s)".
    // On note aussi le TYPE (piece/pack) car le seuil de coupe diffère
    // (pièce: <5, pack: <4).
    let reste = null;
    let type = 'piece';
    const mReste = bloc.match(/Reste\s+(\d+)\s+(pièce|pack)/);
    if (mReste) {
      reste = parseInt(mReste[1], 10);
      type = mReste[2] === 'pack' ? 'pack' : 'piece';
    } else if (/item-type[^>]*>\s*Pack/.test(bloc)) {
      // pack sans "Reste X" affiché -> on retient quand même le type
      type = 'pack';
    }

    // Couleurs de ce variant-item (references machine : WHITE, YELLOW, BURGUNDY...)
    // On lit les data-color-reference présents dans le bloc de la variante.
    const couleurs = [...new Set(
      [...bloc.matchAll(/data-color-reference="([A-Z_]+)"/g)].map((m) => m[1])
    )];

    variantes.push({ couleurs, etat, reste, type });
  }

  return variantes;
}

// ─────────────────────────────────────────────────────────────
// Petit utilitaire : à partir du verdict, dire quelles COULEURS sont indisponibles.
// (Une couleur est indispo si TOUTES ses variantes présentes sont en rupture.)
// Utile plus tard côté Shopify pour mettre l'inventaire à 0 par couleur.
// ─────────────────────────────────────────────────────────────
export function couleursIndisponibles(verdict) {
  if (!verdict.vivant) return [];
  const parCouleur = {}; // ref -> { total, rupture }

  for (const v of verdict.variantes) {
    for (const ref of v.couleurs) {
      parCouleur[ref] ||= { total: 0, rupture: 0 };
      parCouleur[ref].total += 1;
      if (v.etat === 'rupture') parCouleur[ref].rupture += 1;
    }
  }

  return Object.entries(parCouleur)
    .filter(([, s]) => s.total > 0 && s.rupture === s.total)
    .map(([ref]) => ref);
}