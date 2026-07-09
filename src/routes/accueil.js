// routes/accueil.js
// Page d'accueil : tableau de bord avec un résumé rapide + accès aux sections.
// http://localhost:3000/

import { Router } from 'express';
import { shopifyGraphQL } from '../services/shopify-auth.js';
import { lireJournal } from '../services/journal.js';
import { getCommandesGroupees } from '../services/commandes-service.js';
import { menuHTML, styleMenu } from '../services/layout.js';

const router = Router();

router.get('/', async (req, res) => {
  // Résumés (avec valeurs de secours si erreur)
  let nbSurveilles = '—', dernierCheck = 'jamais', nbAAcheter = '—';

  try {
    // nb de produits surveillés (pfs_url + check=on) — compte rapide
    const data = await shopifyGraphQL(`
      query { products(first: 250) { edges { node {
        pfsUrl: metafield(namespace:"custom", key:"pfs_url"){ value }
        check:  metafield(namespace:"custom", key:"check"){ value }
      }}}}
    `);
    nbSurveilles = data.products.edges.filter((e) => {
      const u = e.node.pfsUrl?.value?.trim();
      const f = (e.node.check?.value || '').trim().toLowerCase();
      return u && f === 'on';
    }).length;
  } catch {}

  try {
    const j = await lireJournal();
    if (j.length) dernierCheck = new Date(j[0].date).toLocaleString('fr-FR');
  } catch {}

  try {
    const { aAcheter } = await getCommandesGroupees();
    // compte le nb de références à acheter (tous fournisseurs)
    nbAAcheter = Object.values(aAcheter).reduce((n, refs) => n + Object.keys(refs).length, 0);
  } catch {}

  res.send(`<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accueil — Outil PFS</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f5f5f7;color:#1a1a1a;}
  header{background:#0a6b3f;color:#fff;padding:18px 24px;}
  header h1{margin:0;font-size:19px;}
  .wrap{padding:24px;max-width:900px;margin:0 auto;}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:24px;}
  .card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06);}
  .card .val{font-size:32px;font-weight:700;color:#0a6b3f;}
  .card .lbl{font-size:13px;color:#666;margin-top:4px;}
  .card .sub{font-size:12px;color:#999;margin-top:2px;}
  .btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;}
  .bigbtn{display:block;background:#fff;border-radius:12px;padding:24px;text-decoration:none;color:#1a1a1a;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:transform .1s;}
  .bigbtn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1);}
  .bigbtn .ic{font-size:30px;} .bigbtn .t{font-size:16px;font-weight:600;margin-top:8px;} .bigbtn .d{font-size:13px;color:#777;margin-top:2px;}
  ${styleMenu()}
</style></head><body>
  ${menuHTML('/')}
  <header><h1>🏠 Tableau de bord</h1></header>
  <div class="wrap">
    <div class="cards">
      <div class="card"><div class="val">${nbSurveilles}</div><div class="lbl">Produits surveillés</div></div>
      <div class="card"><div class="val">${nbAAcheter}</div><div class="lbl">Références à acheter</div></div>
      <div class="card"><div class="val" style="font-size:16px;">${dernierCheck}</div><div class="lbl">Dernier check</div></div>
    </div>
    <div class="btns">
      <a class="bigbtn" href="/historique"><div class="ic">📊</div><div class="t">Historique des checks</div><div class="d">Voir ce que l'automatisation a fait</div></a>
      <a class="bigbtn" href="/commandes"><div class="ic">🛒</div><div class="t">Commandes fournisseurs</div><div class="d">Ce qu'il faut acheter, par fournisseur</div></a>
    </div>
  </div>
</body></html>`);
});

export default router;