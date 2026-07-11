// services/auth.js
// Protection par mot de passe unique partagé.
// Le mot de passe est dans la variable d'environnement APP_PASSWORD (Railway + .env local).
// Jamais en dur dans le code, jamais sur GitHub.

import crypto from 'crypto';

const MOT_DE_PASSE = process.env.APP_PASSWORD || '';
// clé pour signer le cookie de session (dérivée du mot de passe, change si le mdp change)
const SECRET = crypto.createHash('sha256').update('sess-' + MOT_DE_PASSE).digest('hex');

// valeur attendue dans le cookie quand on est connecté
const JETON_VALIDE = crypto.createHash('sha256').update(SECRET).digest('hex').slice(0, 32);

// Lit un cookie précis dans la requête
function lireCookie(req, nom) {
  const brut = req.headers.cookie || '';
  for (const part of brut.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === nom) return decodeURIComponent(v || '');
  }
  return null;
}

// La page de connexion (HTML simple)
function pageLogin(erreur = false) {
  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connexion</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a6b3f;}
  .box{background:#fff;padding:36px 32px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.25);width:90%;max-width:360px;text-align:center;}
  .box h1{margin:0 0 6px;font-size:22px;}
  .box p{margin:0 0 22px;color:#777;font-size:14px;}
  input{width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;font-size:16px;margin-bottom:12px;}
  button{width:100%;padding:13px;background:#0a6b3f;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;}
  .err{color:#b42318;font-size:14px;margin-bottom:12px;}
</style></head><body>
  <div class="box">
    <h1>🔒 Nos Copines</h1>
    <p>Espace privé — connexion requise</p>
    ${erreur ? '<div class="err">Mot de passe incorrect</div>' : ''}
    <form method="POST" action="/login">
      <input type="password" name="motdepasse" placeholder="Mot de passe" autofocus>
      <button type="submit">Entrer</button>
    </form>
  </div>
</body></html>`;
}

// Routes appelées par l'EXTENSION (machine, pas navigateur) : elles ne peuvent pas
// taper un mot de passe. On les laisse passer, mais protégées par un token secret
// (APP_API_TOKEN) que l'extension envoie dans l'en-tête. Ces routes ne servent AUCUNE
// donnée sensible affichable — juste la mécanique du check/import.
const ROUTES_MACHINE = ['/check/produits', '/check/resultats', '/import-produit'];
const API_TOKEN = process.env.APP_API_TOKEN || '';

// Middleware : protège l'interface par mot de passe, laisse passer les routes machine.
export function protection(req, res, next) {
  // si pas de mot de passe configuré, on laisse tout passer (évite de se verrouiller dehors)
  if (!MOT_DE_PASSE) return next();

  // la route de login est toujours accessible
  if (req.path === '/login') return next();

  // routes machine (extension) : accès par token, ou libre si aucun token n'est configuré
  if (ROUTES_MACHINE.some((r) => req.path.startsWith(r))) {
    if (!API_TOKEN) return next(); // pas de token configuré -> on laisse (cas local simple)
    const recu = req.headers['x-api-token'] || '';
    if (recu === API_TOKEN) return next();
    return res.status(401).json({ ok: false, erreur: 'token invalide' });
  }

  // déjà connecté ? (interface web)
  const jeton = lireCookie(req, 'session');
  if (jeton === JETON_VALIDE) return next();

  // sinon : page de connexion
  res.status(401).send(pageLogin(false));
}

// Route POST /login : vérifie le mot de passe, pose le cookie
export function traiterLogin(req, res) {
  const saisi = (req.body?.motdepasse || '').trim();
  if (saisi && saisi === MOT_DE_PASSE) {
    // cookie de session : 30 jours, HttpOnly (pas lisible en JS), Secure (HTTPS)
    res.setHeader('Set-Cookie',
      `session=${JETON_VALIDE}; Max-Age=${30 * 24 * 3600}; Path=/; HttpOnly; SameSite=Lax; Secure`);
    return res.redirect('/');
  }
  res.status(401).send(pageLogin(true));
}