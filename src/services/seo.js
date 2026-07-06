// services/seo.js
// Genere le contenu SEO d'un produit via Claude (titre, description detaillee, meta, ALT).
// - Format puces facon Yours / Ulla Popken (factuel, scannable)
// - PAS de description courte (les grandes marques n'en ont pas)
// - Photo envoyee a Claude UNIQUEMENT si la description PFS est pauvre (< SEUIL car.)
// - JAMAIS la couleur (produit multicolore) ni "taille unique"
// - Anti-invention : ne decrit que ce qui est confirme (texte ou photo)
// - Tutoiement "Mes Copines", mot-cle 1-2 fois (anti-bourrage)
// - Anti-cannibalisation par type via titres-generes.json

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FICHIER_TITRES = path.join(__dirname, '..', '..', 'titres-generes.json');
const SEUIL_PHOTO = 150; // description PFS sous ce nb de caracteres -> on envoie la photo

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Mot cle principal par type ───
function motClePrincipal(type) {
  const t = (type || '').toLowerCase();
  // Types précis (le mot du vêtement + "grande taille")
  if (t.includes('tunique')) return 'tunique grande taille';
  if (t.includes('robe longue')) return 'robe longue grande taille';
  if (t.includes('robe')) return 'robe grande taille';
  if (t.includes('combinaison')) return 'combinaison grande taille';
  if (t.includes('ensemble')) return 'ensemble grande taille';
  if (t.includes('jean')) return 'jean grande taille';
  if (t.includes('pantacourt')) return 'pantacourt grande taille';
  if (t.includes('legging')) return 'legging grande taille';
  if (t.includes('pantalon')) return 'pantalon grande taille';
  if (t.includes('jupe')) return 'jupe grande taille';
  if (t.includes('short')) return 'short grande taille';
  if (t.includes('poncho')) return 'poncho grande taille';
  if (t.includes('debardeur') || t.includes('débardeur')) return 'débardeur grande taille';
  if (t.includes('t-shirt') || t.includes('tshirt')) return 't-shirt grande taille';
  if (t.includes('chemis')) return 'chemise grande taille';
  if (t.includes('blouse')) return 'blouse grande taille';
  if (t.includes('gilet')) return 'gilet grande taille';
  if (t.includes('pull')) return 'pull grande taille';
  if (t.includes('top') || t.includes('haut')) return 'top grande taille';
  return 'grande taille';
}

const MOTS_CLES_SECONDAIRES = {
  robe: ['robe longue grande taille', 'robe bohème grande taille', 'robe grande taille été', 'robe grande taille chic'],
  tunique: ['tunique grande taille', 'tunique grande taille chic', 'tunique longue grande taille', 'tunique bohème grande taille'],
  pantalon: ['pantalon femme grande taille', 'pantalon fluide femme grande taille', 'pantalon grande taille taille élastiquée', 'pantalon large grande taille femme'],
  combinaison: ['combinaison grande taille', 'combinaison grandes tailles', 'combinaison femme grande taille chic'],
  top: ['top femme grande taille', 'débardeur grande taille', 'blouse grande taille', 'top grande taille chic'],
};

function motsClesSecondaires(type) {
  const t = (type || '').toLowerCase();
  for (const cle of Object.keys(MOTS_CLES_SECONDAIRES)) {
    if (t.includes(cle)) return MOTS_CLES_SECONDAIRES[cle];
  }
  return ['mode grande taille', 'vêtement femme grande taille'];
}

function typeCle(type) {
  const t = (type || '').toLowerCase();
  for (const c of ['tunique', 'robe', 'pantalon', 'combinaison', 'top']) {
    if (t.includes(c)) return c;
  }
  return 'autre';
}

// ─── Fichier des titres deja generes (anti-cannibalisation) ───
async function lireTitres() {
  try {
    return JSON.parse(await fs.readFile(FICHIER_TITRES, 'utf-8'));
  } catch {
    return {};
  }
}
async function ajouterTitre(cle, titre) {
  const data = await lireTitres();
  (data[cle] ||= []).push(titre);
  if (data[cle].length > 50) data[cle] = data[cle].slice(-50);
  await fs.writeFile(FICHIER_TITRES, JSON.stringify(data, null, 2));
}

function couperMeta(meta, max = 150) {
  if (!meta || meta.length <= max) return meta;
  const coupe = meta.substring(0, max);
  const dernierPoint = Math.max(coupe.lastIndexOf('.'), coupe.lastIndexOf(','));
  if (dernierPoint > max * 0.7) return meta.substring(0, dernierPoint + 1);
  return coupe.substring(0, coupe.lastIndexOf(' '));
}

// Charge une image en base64 (depuis une URL OU un chemin local) pour Claude vision
async function imageEnBase64(source) {
  let buffer;
  if (/^https?:\/\//.test(source)) {
    const rep = await fetch(source, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Referer': 'https://parisfashionshops.com/',
      },
    });
    if (!rep.ok) throw new Error(`image ${rep.status}`);
    buffer = Buffer.from(await rep.arrayBuffer());
  } else {
    // chemin local (face générée par GPT/Gemini)
    buffer = await fs.readFile(source);
  }
  // Detecter le vrai type via les magic bytes
  let type = 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) type = 'image/png';
  else if (buffer[0] === 0x47 && buffer[1] === 0x49) type = 'image/gif';
  else if (buffer.slice(8, 12).toString() === 'WEBP') type = 'image/webp';
  else if (buffer[0] === 0xFF && buffer[1] === 0xD8) type = 'image/jpeg';
  return { data: buffer.toString('base64'), media_type: type };
}

// ─── Avis client : prénoms féminins (générations 40-90 ans) ───
const PRENOMS_AVIS = [
  'Christine', 'Sylvie', 'Martine', 'Nathalie', 'Chantal', 'Brigitte', 'Isabelle',
  'Catherine', 'Françoise', 'Monique', 'Nicole', 'Véronique', 'Corinne', 'Patricia',
  'Valérie', 'Sandrine', 'Michèle', 'Dominique', 'Sophie', 'Karine', 'Séverine',
  'Béatrice', 'Laurence', 'Pascale', 'Fabienne', 'Christiane', 'Danielle', 'Jocelyne',
  'Marie', 'Anne', 'Florence', 'Céline', 'Delphine', 'Virginie', 'Aurélie', 'Stéphanie',
  'Nadine', 'Josiane', 'Annie', 'Évelyne', 'Joëlle', 'Sabine', 'Muriel', 'Ghislaine',
  'Colette', 'Bernadette', 'Régine', 'Odile', 'Geneviève', 'Hélène', 'Agnès', 'Claudine',
  'Myriam', 'Sonia', 'Carole', 'Jacqueline', 'Marie-Claude', 'Simone', 'Yvette',
  'Denise', 'Paulette', 'Huguette', 'Micheline', 'Renée', 'Suzanne', 'Gisèle', 'Lucienne',
  'Marcelle', 'Andrée', 'Jeannine', 'Solange', 'Éliane', 'Arlette', 'Raymonde', 'Georgette',
  'Liliane', 'Marguerite', 'Thérèse', 'Yvonne', 'Germaine', 'Roselyne', 'Mireille', 'Nadège',
];
const INITIALES = 'ABCDEFGHIJKLMNOPRSTVLM'.split('');

// Génère un nom d'avis "Prénom.X" aléatoire
function genererNomAvis() {
  const prenom = PRENOMS_AVIS[Math.floor(Math.random() * PRENOMS_AVIS.length)];
  const initiale = INITIALES[Math.floor(Math.random() * INITIALES.length)];
  return `${prenom}.${initiale}`;
}

// Génère une date aléatoire dans le passé (1 à 200 jours avant aujourd'hui), format JJ/MM/AAAA
function genererDateAvis() {
  const jours = Math.floor(Math.random() * 200) + 1; // 1 à 200
  const d = new Date();
  d.setDate(d.getDate() - jours);
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = d.getFullYear();
  return `${jj}/${mm}/${aaaa}`;
}

// ─── Fonction principale ───
// produit = { titre, description, composition, collection, categorie, couleurs:[labels], tailles:[...], urlPhoto }
export async function genererSEO(produit) {
  // Priorité au Type choisi dans la modale (ex "Jupe"), sinon catégorie/titre
  const type = produit.productType || produit.categorie || produit.titre || '';
  const motCle = motClePrincipal(type);
  const secondaires = motsClesSecondaires(type).join(', ');
  const cle = typeCle(type);

  const tousTitres = await lireTitres();
  const titresRecents = (tousTitres[cle] || []).slice(-15);
  const antiCannib = titresRecents.length > 0
    ? `\n━━━ TITRES DÉJÀ UTILISÉS (même catégorie) — choisis un ANGLE DIFFÉRENT ━━━\n- ${titresRecents.join('\n- ')}\n`
    : '';

  const tailles = produit.tailles || [];
  const tMin = tailles[0] || 44;
  const tMax = tailles[tailles.length - 1] || 70;

  // Decide-t-on d'envoyer la photo ? (description PFS pauvre)
  const descPFS = (produit.description || '').trim();
  const sourcePhoto = produit.urlPhotoLocale || produit.urlPhoto || null;
  const envoyerPhoto = descPFS.length < SEUIL_PHOTO && !!sourcePhoto;

  const instructionPhoto = envoyerPhoto
    ? `\n━━━ IMPORTANT — PHOTO FOURNIE ━━━
La description fournisseur est pauvre. Une PHOTO du produit est jointe.
Regarde la photo pour identifier la COUPE, le COL/encolure, les MANCHES, les DÉTAILS (boutons, fronces, bretelles, broderie...) et la LONGUEUR approximative.
IGNORE TOTALEMENT LA COULEUR du vêtement sur la photo (le produit existe en plusieurs coloris).
Ne décris QUE ce que tu vois réellement. N'invente aucun détail absent.\n`
    : '';

  const prompt = `Tu es expert SEO e-commerce mode féminine grande taille pour le marché français. Tu écris pour la marque "Mes Copines", chaleureuse et complice, qui aide chaque femme à se sentir belle, stylée et en confiance. TON = TUTOIEMENT élégant et bienveillant (jamais vulgaire ni trop familier). Tu vends du STYLE et de la CONFIANCE comme une marque de mode classique, sans insister sur la morphologie.

━━━ DONNÉES PRODUIT (matière première — NE PAS COPIER, tout réécrire) ━━━
Type : ${type}
Description fournisseur : ${descPFS || '(vide)'}
Composition : ${produit.composition || 'non précisée'}
Collection : ${produit.collection || 'non précisée'}
Tailles disponibles : du ${tMin} au ${tMax}
${instructionPhoto}${antiCannib}
━━━ MOT CLÉ PRINCIPAL ━━━
"${motCle}" — DOIT apparaître dans le titre, et 1 à 2 fois MAXIMUM dans la description (PAS de bourrage).

━━━ MOTS CLÉS SECONDAIRES (à glisser naturellement, SEULEMENT s'ils sont vrais) ━━━
${secondaires}

━━━ RÈGLES ABSOLUES ━━━
- ⛔ INTERDICTION TOTALE DE MENTIONNER UNE COULEUR. N'écris JAMAIS un nom de couleur (kaki, noir, beige, blanc, marron, rose, bleu, vert, etc.) NULLE PART : ni dans le titre, ni la description, ni la méta, ni l'ALT. Le produit existe en plusieurs coloris, parler d'une couleur serait FAUX. Si tu vois une couleur sur la photo, IGNORE-LA totalement.
- ⛔ TAILLES : utilise UNIQUEMENT les tailles "du ${tMin} au ${tMax}" indiquées ci-dessus. La description fournisseur peut mentionner d'AUTRES tailles (ex: "46-54", "TU 46/52") — IGNORE-LES TOTALEMENT. Ne reprends JAMAIS une fourchette de tailles venant de la description fournisseur. Les SEULES tailles valides sont du ${tMin} au ${tMax}.
- JAMAIS "taille unique", "TU", ni code taille (XL, 1X, 2X...). On vend du ${tMin} au ${tMax}.
- N'utilise un mot-clé matière (lin, coton, viscose...) que s'il correspond EXACTEMENT à la composition ci-dessus. Si la composition dit "coton", n'écris JAMAIS "lin". Si elle dit "viscose", n'écris pas "coton".
- N'invente AUCUN détail : décris seulement ce qui est confirmé par le texte ou la photo.
- Si une info manque (col, longueur...), ne la mentionne pas (ne devine pas).
- Écriture NATURELLE pour un humain d'abord (Google 2026 pénalise le sur-optimisé).
- COURT : la description fait 110-150 mots MAX. Pas de longs paragraphes, va à l'essentiel.
- ORTHOGRAPHE : relis-toi, accorde correctement les adjectifs (manches "volantées" pas "volanté", "festonnées", etc.).
- DENSITÉ MOT-CLÉ : "grande taille" doit apparaître 3 à 4 fois MAXIMUM dans toute la fiche (pas plus), car c'est le mot-clé SEO. Pour varier, utilise surtout "du ${tMin} au ${tMax}". ⚠️ ÉVITE les formules qui insistent lourdement sur le corps ("silhouette généreuse", "morphologie ronde", "tes courbes", "formes généreuses") : n'en utilise AUCUNE ou UNE SEULE fois maximum sur toute la fiche. On vend du STYLE, du confort et de la confiance — comme une marque de mode classique — pas "la grande taille". La cliente doit se sentir belle et stylée, pas étiquetée.
- TERME DOMINANT COHÉRENT : choisis UN seul mot pour désigner le vêtement (celui du titre : "top" OU "tunique" OU "robe"...) et garde-le dans TOUTE la fiche. Ne mélange pas "top" et "tunique" pour le même produit.

━━━ CE QUE TU GÉNÈRES ━━━

1. TITRE (50-60 caractères STRICT, ne JAMAIS dépasser 60) : DOIT COMMENCER par le type de vêtement (ex "Jupe", "Robe", "Top", "Débardeur"...) — JAMAIS par le mot générique "Vêtement". Contient "${motCle}" (donc "grande taille" UNE SEULE FOIS, pas plus). Ajoute 1-2 éléments descriptifs (matière, col, coupe, longueur ou détail). SANS couleur, SANS mention de taille chiffrée, SANS nom de marque. Naturel et fluide, pas un empilement de mots-clés. Exemple correct : "Jupe longue fluide grande taille taille haute élastiquée".

2. DESCRIPTION DÉTAILLÉE (HTML, ~150 mots de rédactionnel répartis — joli ET optimisé) :
<h2>[Titre descriptif avec le mot-clé principal, ex: "Tunique longue grande taille en broderie anglaise"]</h2>
<p>[Accroche 2-3 phrases, tutoiement. Intègre NATURELLEMENT des expressions de recherche réelles "longue traîne" que les femmes tapent vraiment, ex: "tunique grande taille été", "tunique col bardot femme", "haut bohème grande taille". Pas de bourrage, ça doit couler.]</p>
<ul>
  <li>[Matière / qualité du tissu]</li>
  <li>[Col / encolure]</li>
  <li>[Coupe / forme du vêtement]</li>
  <li>[Manches ou détail spécifique]</li>
  <li>[Longueur approximative SI connue]</li>
  <li>[Entretien]</li>
</ul>
<p>[Paragraphe de fin 2-3 phrases : occasions de port concrètes (bureau, terrasse, vacances...), conseils d'association (avec un jean, un legging...), et réassurance. Mentionne "du ${tMin} au ${tMax}". Glisse 1-2 autres expressions longue traîne naturellement.]</p>
(Total ~150 mots rédactionnels. N'inclus que les puces dont tu as l'info réelle. AUCUNE couleur. Pas de détail inventé.)

3. META DESCRIPTION (130-150 caractères STRICT, phrase complète) : commence par "${motCle}" ou variante proche, 1-2 détails concrets (SANS couleur), mentionne "du ${tMin} au ${tMax}", finit par un CTA court ("Livraison rapide en France." / "Adopte-la cet été." / "Commande la tienne.").

4. ALT IMAGES (1 phrase courte, SANS couleur, ex: "Tunique grande taille col bardot broderie anglaise coupe ample").

5. ATOUTS (orienté BÉNÉFICE, façon grande marque type Gymshark). Objectif : donner envie d'acheter en parlant des bénéfices RESSENTIS, pas des caractéristiques techniques.
D'abord une PHRASE D'INTRO (1 phrase courte, le pitch global du vêtement : à quoi/qui il sert, ce qu'il dégage. Ex Gymshark : "C'est parfait pour l'hybrid training. Ces leggings ont une taille haute et un design seamless.").
Puis EXACTEMENT 3 atouts, TOUJOURS dans cet ordre précis (chaque atout sera affiché à côté d'une icône fixe, donc l'ordre est obligatoire) :
- ATOUT 1 = le STYLE / l'allure / le look du vêtement (ce qu'il dégage, l'effet mode).
- ATOUT 2 = la MATIÈRE / le confort / la sensation portée (le tissu, le toucher, le bien-être).
- ATOUT 3 = un DÉTAIL distinctif OU la polyvalence / le petit plus (un détail de fabrication, ou les occasions/associations).
Chaque atout = un titre court accrocheur (2-3 mots) + une phrase qui décrit le bénéfice ressenti. PAS d'emoji (les icônes sont gérées par le site).
Règles : spécifique à CE vêtement (vraie matière/coupe/détails visibles), pas générique. Ton chaleureux "Mes Copines" (tutoiement), élégant. ⚠️ Vends du STYLE et de la CONFIANCE comme une marque de mode classique : n'insiste PAS sur le corps (évite "silhouette généreuse", "tes courbes", "morphologie ronde"). AUCUNE couleur. ⛔ N'utilise AUCUN tiret long "—" ni tiret "–" ni "-" dans les phrases (ça fait artificiel) : écris des phrases normales avec des virgules ou des points.

6. COMPOSITION (composition_html) : à partir de la composition réelle "${produit.composition || 'non précisée'}", écris un petit bloc VENDEUR en TEXTE SIMPLE (PAS de HTML, PAS de balises <p> <ul> <li>). Structure :
- 1 phrase courte qui VALORISE la matière (le toucher, le tombé, la sensation, le confort ressenti) façon belle marque, sans exagérer ni mentir sur la matière.
- un saut de ligne (\\n)
- puis les pourcentages exacts sur une ligne, précédés du caractère "• " (ex: "• 95% coton, 5% élasthanne").
Exemple exact du format attendu (avec un vrai retour à la ligne) :
Une maille douce et extensible qui épouse le mouvement avec naturel.
• 95% coton, 5% élasthanne
Si la composition est "non précisée" ou vide, renvoie une chaîne vide "". N'invente JAMAIS de pourcentages : reprends EXACTEMENT ceux fournis. AUCUNE couleur, PAS de tiret "—", AUCUNE balise HTML.

7. AVIS CLIENT (avis_texte) : écris UN avis client 100% authentique et spontané, comme une VRAIE cliente (femme de 40 à 90 ans, cliente d'une boutique de mode grande taille chaleureuse appelée "Nos Copines"). Ton naturel, parlé, sincère, un peu imparfait (comme un vrai avis, pas un texte marketing lisse). Longueur VARIABLE : parfois 1 phrase courte, parfois 3-4 phrases. Peut mentionner "Nos Copines" ou pas. AUCUNE couleur précise, PAS de tiret "—", PAS de balise HTML.

⚠️ IMPORTANT : choisis AU HASARD UN SEUL de ces 10 angles (varie à chaque fois pour que les avis ne se ressemblent pas) :
1. CONFORT/BIEN-ÊTRE : la matière agréable, à l'aise toute la journée, ne serre pas.
2. DÉCOUVERTE + ÉMOTION : "découvert par hasard sur Facebook/Instagram", "je me sens enfin belle moi qui fais un 56/58/60+, enfin des habits qui nous vont, merci Nos Copines".
3. COMPLIMENTS REÇUS : on lui a fait des compliments, on lui a demandé où elle l'avait acheté.
4. QUALITÉ QUI SURPREND : elle ne s'attendait pas à cette qualité pour le prix, matière mieux que prévu.
5. RÉACHAT/FIDÉLITÉ : "ma 2e/3e commande", "je vais en reprendre une autre", cliente fidèle.
6. OCCASION SPÉCIALE : portée pour un mariage, un anniversaire, un événement, des vacances.
7. SUPPORT CLIENT RÉACTIF : un souci de livraison résolu vite, un contact humain sympa (elle peut glisser un clin d'œil léger et bon enfant sur "le Nathan que j'ai eu au téléphone a une voix sympathique ;)").
8. PEUR PUIS SOULAGEMENT : "j'avais un peu peur de commander en ligne, je me suis lancée et aucune déception, je recommande".
9. COUPE FLATTEUSE : la coupe lui va parfaitement, tombe bien, elle se sent à l'aise dans son corps.
10. LIVRAISON/RAPIDITÉ : reçu rapidement, bien emballé, conforme à la photo.

Rends-le crédible et touchant, avec le vrai vocabulaire d'une cliente (pas de jargon). Une petite imperfection naturelle est bienvenue (mais reste positif : l'avis est content).

RÉPONDS UNIQUEMENT EN JSON (aucun texte ni balise markdown autour). Pour les atouts, donne un titre et un texte séparés :
{"titre":"...","description_html":"...","meta_description":"...","alt_images":"...","atouts_intro":"...","atout1_titre":"...","atout1_texte":"...","atout2_titre":"...","atout2_texte":"...","atout3_titre":"...","atout3_texte":"...","composition_html":"...","avis_texte":"..."}`;

  // Construire le message (avec ou sans image)
  const contenu = [];
  if (envoyerPhoto) {
    try {
      const img = await imageEnBase64(sourcePhoto);
      contenu.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
    } catch (e) {
      console.log('   [seo] photo non chargée, on continue en texte seul');
    }
  }
  contenu.push({ type: 'text', text: prompt });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: contenu }],
  });

  let texte = response.content[0].text.trim()
    .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let json;
  try {
    json = JSON.parse(texte);
  } catch (e) {
    console.error('   [seo] JSON non parsable :', texte.slice(0, 200));
    throw new Error('JSON invalide retourné par Claude');
  }

  // Garde-fou : retirer toute mention "taille unique"/"TU"
  const nettoyer = (s) => (s || '')
    .replace(/taille\s+unique/gi, '')
    .replace(/\bT\.?U\.?\b/g, '')
    .replace(/\s{2,}/g, ' ').trim();

  json.description_html = nettoyer(json.description_html);
  json.meta_description = couperMeta(nettoyer(json.meta_description), 150);
  // Composition : on garde les retours à la ligne (texte simple), on enlève juste les balises HTML éventuelles
  json.composition_html = (json.composition_html || '')
    .replace(/<[^>]+>/g, '')          // enlève toute balise HTML résiduelle
    .replace(/[ \t]{2,}/g, ' ')       // espaces multiples (mais PAS les \n)
    .replace(/\n{3,}/g, '\n\n')        // max 2 sauts de ligne
    .trim();
  json.avis_texte = nettoyer(json.avis_texte);
  // Nettoyage des 3 atouts (titre + texte)
  for (const k of ['atouts_intro', 'atout1_titre', 'atout1_texte', 'atout2_titre', 'atout2_texte', 'atout3_titre', 'atout3_texte']) {
    json[k] = nettoyer(json[k]);
    // Retire les tirets longs/moyens que l'IA glisse parfois (fait "artificiel")
    if (json[k]) {
      json[k] = json[k]
        .replace(/\s*[—–]\s*/g, ', ')   // — ou – entouré d'espaces → virgule
        .replace(/,\s*,/g, ',')           // double virgule éventuelle
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
  }

  // Garde-fou couleur : on alerte si une couleur a quand même été mentionnée
  const couleursInterdites = /\b(noir|noire|blanc|blanche|beige|marron|rouge|rose|bleu|bleue|vert|verte|jaune|orange|violet|violette|gris|grise|kaki|marine|taupe|bordeaux|corail|fuchsia|écru|ecru|crème|creme)\b/i;
  for (const [champ, val] of Object.entries({ titre: json.titre, meta: json.meta_description, alt: json.alt_images })) {
    if (couleursInterdites.test(val || '')) {
      console.log(`   [seo] ⚠️ couleur détectée dans ${champ} : "${val}" (à surveiller)`);
    }
  }

  await ajouterTitre(cle, json.titre);

  return {
    titre: json.titre,
    descriptionHtml: json.description_html,
    metaDescription: json.meta_description,
    altImages: json.alt_images,
    atoutsIntro: json.atouts_intro,
    atout1Titre: json.atout1_titre,
    atout1Texte: json.atout1_texte,
    atout2Titre: json.atout2_titre,
    atout2Texte: json.atout2_texte,
    atout3Titre: json.atout3_titre,
    atout3Texte: json.atout3_texte,
    // HTML prêt à coller dans un metafield par atout (titre en gras + phrase)
    atout1Html: `<p><strong>${json.atout1_titre}</strong><br>${json.atout1_texte}</p>`,
    atout2Html: `<p><strong>${json.atout2_titre}</strong><br>${json.atout2_texte}</p>`,
    atout3Html: `<p><strong>${json.atout3_titre}</strong><br>${json.atout3_texte}</p>`,
    compositionHtml: json.composition_html || '',
    avisTexte: json.avis_texte || '',
    avisNom: genererNomAvis(),
    avisDate: genererDateAvis(),
    photoUtilisee: envoyerPhoto,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}