// routes/commandes.js
// Page "Commandes fournisseurs" avec 2 onglets : À acheter / Déjà acheté.
// http://localhost:3000/commandes

import { Router } from 'express';
import { getCommandesGroupees } from '../services/commandes-service.js';
import { setEtat } from '../services/commandes-etat.js';
import { lireFournisseurs, setFournisseur } from '../services/fournisseurs-info.js';
import { menuHTML, styleMenu } from '../services/layout.js';

const router = Router();

// nom fournisseur -> id CSS safe
function cssId(s){ return String(s).replace(/[^a-zA-Z0-9]/g, '_'); }

function vignette(url) {
  if (!url) return null;
  return url.includes('?') ? url.replace('?', '?width=140&') : url + '?width=140';
}

// Cocher / décocher des ventes (acheté ou non)
router.post('/commandes/etat', async (req, res) => {
  const { ids, achete } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ ok: false });
  const ok = await setEtat(ids, !!achete);
  res.json({ ok });
});

// Enregistrer les infos d'un fournisseur
router.post('/commandes/fournisseur', async (req, res) => {
  const { nom, adresse, telephone } = req.body || {};
  if (!nom) return res.status(400).json({ ok: false });
  const ok = await setFournisseur(nom, adresse, telephone);
  res.json({ ok });
});

router.get('/commandes', async (req, res) => {
  const { aAcheter, dejaAchete } = await getCommandesGroupees();
  const infos = await lireFournisseurs();

  // génère le HTML d'un onglet (groupé par fournisseur -> références)
  function renderOnglet(data, achete) {
    const fournisseurs = Object.keys(data).sort();
    if (fournisseurs.length === 0) {
      return `<div class="vide">${achete ? 'Rien acheté pour le moment.' : 'Aucune commande à acheter.'}</div>`;
    }

    return fournisseurs.map((f) => {
      const info = infos[f] || { adresse: '', telephone: '' };
      const refs = data[f];

      const blocsRef = Object.values(refs).map((r) => {
        const img = vignette(r.image);
        const imgHtml = img
          ? `<img class="vig" src="${img}" data-full="${r.image}" alt="">`
          : '<div class="vig noimg">—</div>';
        const variantes = Object.entries(r.variantes)
          .map(([v, q]) => `<span class="var">${v} <b>×${q}</b></span>`).join(' ');
        const idsAttr = r.ids.join(',');
        return `
          <div class="ref">
            ${imgHtml}
            <div class="refinfo">
              <div class="refnum">RÉF ${r.reference}</div>
              <div class="reftitre">${r.titre}</div>
              <div class="variantes">${variantes}</div>
            </div>
            <label class="check">
              <input type="checkbox" ${achete ? 'checked' : ''}
                onchange="cocher(this, '${idsAttr}', ${achete ? 'false' : 'true'})">
              <span>${achete ? 'acheté' : 'acheté ?'}</span>
            </label>
          </div>`;
      }).join('');

      const tel = info.telephone
        ? `<a href="tel:${info.telephone.replace(/\s/g, '')}" class="tel">📞 ${info.telephone}</a>`
        : '';

      return `
        <div class="fourn">
          <div class="fournhead">
            <h3>${f}</h3>
            <button class="infobtn" onclick="toggleInfo('${cssId(f)}')">ℹ️ infos</button>
            ${tel}
          </div>
          <div class="infobox" id="info-${cssId(f)}" style="display:none;">
            <label>Adresse<textarea data-f="${f}" class="fadr">${info.adresse || ''}</textarea></label>
            <label>Téléphone<input data-f="${f}" class="ftel" value="${info.telephone || ''}"></label>
            <button class="save" onclick="saveInfo('${f}', '${cssId(f)}')">💾 Enregistrer</button>
            <span class="saved" id="saved-${cssId(f)}"></span>
          </div>
          <div class="refs">${blocsRef}</div>
        </div>`;
    }).join('');
  }

  const htmlAAcheter = renderOnglet(aAcheter, false);
  const htmlDeja = renderOnglet(dejaAchete, true);

  res.send(`<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Commandes fournisseurs</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f5f5f7;color:#1a1a1a;}
  header{background:#0a6b3f;color:#fff;padding:18px 24px;}
  header h1{margin:0;font-size:19px;}
  .tabs{display:flex;gap:8px;padding:16px 24px 0;max-width:900px;margin:0 auto;}
  .tab{flex:1;padding:12px;text-align:center;background:#e8e8ea;border:none;border-radius:10px 10px 0 0;font-size:15px;font-weight:600;cursor:pointer;color:#555;}
  .tab.active{background:#fff;color:#0a6b3f;}
  .wrap{padding:0 24px 40px;max-width:900px;margin:0 auto;}
  .panel{background:#fff;border-radius:0 0 12px 12px;padding:16px;min-height:200px;}
  .fourn{margin-bottom:22px;border:1px solid #eee;border-radius:12px;overflow:hidden;}
  .fournhead{display:flex;align-items:center;gap:12px;background:#fafafa;padding:12px 14px;flex-wrap:wrap;}
  .fournhead h3{margin:0;font-size:16px;color:#0a6b3f;}
  .infobtn{background:#eef0f2;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;}
  .tel{margin-left:auto;color:#0a6b3f;text-decoration:none;font-weight:600;font-size:14px;}
  .infobox{padding:12px 14px;background:#f0f7f3;display:flex;flex-direction:column;gap:8px;}
  .infobox label{font-size:12px;color:#555;display:flex;flex-direction:column;gap:4px;}
  .infobox textarea,.infobox input{padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px;font-family:inherit;}
  .infobox textarea{resize:vertical;min-height:44px;}
  .save{align-self:flex-start;background:#0a6b3f;color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;}
  .saved{font-size:12px;color:#0a6b3f;}
  .refs{padding:8px 14px 14px;}
  .ref{display:flex;gap:12px;align-items:center;padding:10px;border-radius:10px;margin:6px 0;background:#fafafa;}
  .vig{width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:zoom-in;flex-shrink:0;border:1px solid #eee;}
  .vig.noimg{display:flex;align-items:center;justify-content:center;color:#ccc;background:#f0f0f0;}
  .refinfo{flex:1;min-width:0;}
  .refnum{font-weight:700;font-size:15px;}
  .reftitre{font-size:13px;color:#555;margin:2px 0;}
  .variantes{font-size:13px;} .var{display:inline-block;background:#eef0f2;padding:2px 8px;border-radius:5px;margin:2px 2px 0 0;}
  .check{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:#666;cursor:pointer;}
  .check input{width:22px;height:22px;cursor:pointer;}
  .vide{text-align:center;padding:50px;color:#999;}
  #lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;}
  #lb img{max-width:90%;max-height:90%;border-radius:8px;}
  ${styleMenu()}
</style></head><body>
  ${menuHTML('/commandes')}
  <header><h1>🛒 Commandes fournisseurs</h1></header>
  <div class="tabs">
    <button class="tab active" id="tab-a" onclick="showTab('a')">À acheter</button>
    <button class="tab" id="tab-d" onclick="showTab('d')">Déjà acheté</button>
  </div>
  <div class="wrap">
    <div class="panel" id="panel-a">${htmlAAcheter}</div>
    <div class="panel" id="panel-d" style="display:none;">${htmlDeja}</div>
  </div>
  <div id="lb" onclick="this.style.display='none'"><img id="lbimg" src=""></div>
  <script>
    function showTab(t){
      document.getElementById('panel-a').style.display = t==='a'?'block':'none';
      document.getElementById('panel-d').style.display = t==='d'?'block':'none';
      document.getElementById('tab-a').classList.toggle('active', t==='a');
      document.getElementById('tab-d').classList.toggle('active', t==='d');
    }
    async function cocher(el, idsStr, achete){
      const ids = idsStr.split(',');
      el.disabled = true;
      try{
        await fetch('/commandes/etat', {method:'POST',headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ ids, achete: achete })});
        // recharge pour refléter le déplacement entre onglets
        location.reload();
      }catch(e){ el.disabled=false; alert('Erreur'); }
    }
    async function saveInfo(nom, cssid){
      const adr = document.querySelector('.fadr[data-f="'+nom+'"]').value;
      const tel = document.querySelector('.ftel[data-f="'+nom+'"]').value;
      try{
        await fetch('/commandes/fournisseur',{method:'POST',headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ nom, adresse: adr, telephone: tel })});
        document.getElementById('saved-'+cssid).textContent = '✓ enregistré';
        setTimeout(()=>location.reload(), 600);
      }catch(e){ alert('Erreur'); }
    }
    function toggleInfo(cssid){
      var b=document.getElementById('info-'+cssid);
      b.style.display = b.style.display==='none'?'flex':'none';
    }
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