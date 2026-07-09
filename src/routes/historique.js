// routes/historique.js
// Page web de suivi des checks PFS, avec accordéon dépliable.
// http://localhost:3000/historique

import { Router } from 'express';
import { lireJournal } from '../services/journal.js';
import { menuHTML, styleMenu } from '../services/layout.js';

const router = Router();

// URL admin Shopify d'un produit à partir du handle (ou fallback)
function lienShopify(handle) {
  const store = (process.env.SHOPIFY_STORE || '').replace('.myshopify.com', '');
  if (!handle || !store) return null;
  return `https://admin.shopify.com/store/${store}/products?query=${encodeURIComponent(handle)}`;
}

// vignette Shopify réduite (rapide)
function vignette(url) {
  if (!url) return null;
  // insère width avant le ?v= pour demander une petite image
  return url.includes('?') ? url.replace('?', '?width=120&') : url + '?width=120';
}

router.get('/historique/data', async (req, res) => {
  res.json(await lireJournal());
});

router.get('/historique', async (req, res) => {
  const journal = await lireJournal();

  const runs = journal.map((e, idx) => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleString('fr-FR');
    const modeStr = e.mode === 'reel' ? '⚡ appliqué' : '🔒 simulation';

    const produits = e.produits || [];
    const verts = produits.filter((p) => p.niveau === 'vert');
    const oranges = produits.filter((p) => p.niveau === 'orange');
    const rouges = produits.filter((p) => p.niveau === 'rouge');

    // résumé de la ligne
    const resume = `🟢 ${verts.length}  🟠 ${oranges.length}  🔴 ${rouges.length}`;

    // bloc produit détaillé
    function blocProduit(p) {
      const img = vignette(p.image);
      const imgHtml = img
        ? `<img class="vig" src="${img}" data-full="${p.image}" alt="">`
        : '<div class="vig noimg">—</div>';
      const liens = [
        lienShopify(p.handle) ? `<a href="${lienShopify(p.handle)}" target="_blank">Shopify ↗</a>` : '',
        p.pfsUrl ? `<a href="${p.pfsUrl}" target="_blank">PFS ↗</a>` : '',
      ].filter(Boolean).join(' · ');

      const chgs = (p.changements || []).map((c) =>
        `<div class="chgline">
           <span class="chg ${c.vers === 0 ? 'zero' : 'dispo'}">${c.couleur} → ${c.vers}</span>
           <span class="nb">${c.nb} taille(s)</span>
           <span class="raison">${c.raison || ''}</span>
         </div>`
      ).join('');

      return `<div class="prod ${p.niveau}">
        ${imgHtml}
        <div class="prodinfo">
          <div class="prodtitre">${p.produit}</div>
          <div class="liens">${liens}</div>
          ${chgs || '<div class="rien">rien modifié</div>'}
        </div>
      </div>`;
    }

    const groupe = (titre, arr, cls) => arr.length
      ? `<div class="groupe"><h4 class="${cls}">${titre} (${arr.length})</h4>${arr.map(blocProduit).join('')}</div>`
      : '';

    const detail = `
      ${groupe('🔴 Retirés / rupture totale', rouges, 'rouge')}
      ${groupe('🟠 Partiellement modifiés', oranges, 'orange')}
      ${groupe('🟢 OK / disponibles', verts, 'vert')}
      ${produits.length === 0 ? '<div class="rien">Aucun produit modifié.</div>' : ''}
    `;

    return `
      <div class="run">
        <div class="runhead" onclick="toggle(${idx})">
          <span class="arrow" id="arrow-${idx}">▶</span>
          <span class="rundate">${dateStr}</span>
          <span class="runmode ${e.mode === 'reel' ? 'reel' : 'simu'}">${modeStr}</span>
          <span class="runcount">${e.totalVerifies ?? '—'} vérifiés</span>
          <span class="runresume">${resume}</span>
          ${e.alerte ? '<span class="alerte">⚠️ garde-fou</span>' : ''}
        </div>
        <div class="rundetail" id="detail-${idx}" style="display:none;">${detail}</div>
      </div>`;
  }).join('');

  res.send(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Historique checks PFS</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f5f5f7;color:#1a1a1a;}
  header{background:#0a6b3f;color:#fff;padding:20px 28px;}
  header h1{margin:0;font-size:20px;} header p{margin:4px 0 0;opacity:.85;font-size:13px;}
  .wrap{padding:24px 28px;max-width:1000px;margin:0 auto;}
  .refresh{display:inline-block;margin-bottom:16px;padding:8px 16px;background:#0a6b3f;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;}
  .run{background:#fff;border-radius:12px;margin-bottom:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);}
  .runhead{display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;user-select:none;flex-wrap:wrap;}
  .runhead:hover{background:#fafafa;}
  .arrow{color:#999;font-size:11px;transition:transform .15s;}
  .arrow.open{transform:rotate(90deg);}
  .rundate{font-size:13px;color:#444;font-weight:600;white-space:nowrap;}
  .runmode{font-size:12px;padding:2px 8px;border-radius:6px;}
  .runmode.reel{background:#e6f4ec;color:#0a6b3f;} .runmode.simu{background:#eef0f2;color:#555;}
  .runcount{font-size:13px;color:#666;}
  .runresume{font-size:13px;margin-left:auto;white-space:nowrap;}
  .alerte{color:#b42318;font-weight:600;font-size:12px;}
  .rundetail{padding:8px 16px 16px;border-top:1px solid #eee;}
  .groupe{margin-top:12px;}
  .groupe h4{margin:8px 0;font-size:13px;padding:4px 8px;border-radius:6px;display:inline-block;}
  .groupe h4.rouge{background:#fde8e8;color:#b42318;}
  .groupe h4.orange{background:#fff3e0;color:#b25e00;}
  .groupe h4.vert{background:#e6f4ec;color:#0a6b3f;}
  .prod{display:flex;gap:12px;padding:10px;border-radius:10px;margin:6px 0;background:#fafafa;}
  .prod.rouge{background:#fef4f4;} .prod.orange{background:#fff9f0;}
  .vig{width:60px;height:60px;object-fit:cover;border-radius:8px;cursor:zoom-in;flex-shrink:0;border:1px solid #eee;}
  .vig.noimg{display:flex;align-items:center;justify-content:center;color:#ccc;background:#f0f0f0;}
  .prodinfo{flex:1;min-width:0;}
  .prodtitre{font-weight:600;font-size:14px;margin-bottom:2px;}
  .liens{font-size:12px;margin-bottom:6px;} .liens a{color:#0a6b3f;text-decoration:none;margin-right:4px;}
  .chgline{display:flex;gap:8px;align-items:center;font-size:12px;margin:2px 0;flex-wrap:wrap;}
  .chg{padding:2px 7px;border-radius:5px;font-weight:600;}
  .chg.zero{background:#fde8e8;color:#b42318;} .chg.dispo{background:#e6f4ec;color:#0a6b3f;}
  .nb{color:#666;} .raison{color:#999;font-style:italic;}
  .rien{color:#999;font-size:13px;}
  .vide{text-align:center;padding:60px;color:#999;}
  /* lightbox */
  #lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;}
  #lb img{max-width:90%;max-height:90%;border-radius:8px;}
  ${styleMenu()}
</style>
</head><body>
  ${menuHTML('/historique')}
  <header><h1>🔍 Historique des vérifications PFS</h1>
  <p>${journal.length} run(s) — clique une ligne pour voir le détail</p></header>
  <div class="wrap">
    <a class="refresh" href="/historique">↻ Rafraîchir</a>
    ${journal.length === 0
      ? '<div class="vide">Aucun check enregistré pour le moment.<br>Lance une vérification et reviens ici.</div>'
      : runs}
  </div>
  <div id="lb" onclick="this.style.display='none'"><img id="lbimg" src=""></div>
  <script>
    function toggle(i){
      var d=document.getElementById('detail-'+i), a=document.getElementById('arrow-'+i);
      var open=d.style.display==='none';
      d.style.display=open?'block':'none';
      a.classList.toggle('open',open);
    }
    // clic sur vignette -> grand
    document.addEventListener('click',function(ev){
      if(ev.target.classList.contains('vig') && ev.target.dataset.full){
        document.getElementById('lbimg').src=ev.target.dataset.full;
        document.getElementById('lb').style.display='flex';
      }
    });
  </script>
</body></html>`);
});

export default router;