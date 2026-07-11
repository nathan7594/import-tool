// routes/commandes.js
// Page "À acheter" (pour le PATRON) : voit TOUT, groupé par fournisseur -> référence,
// avec une PASTILLE d'état (🟢 réservé / 🔴 rupture / ⚪ à commander) alimentée par le suivi.
// Rien n'est caché : même les ruptures restent visibles (le patron re-vérifie sur place).

import { Router } from 'express';
import { getCommandesAvecSuivi } from '../services/commandes-service.js';
import { lireFournisseurs, setFournisseur } from '../services/fournisseurs-info.js';
import { setStatut } from '../services/suivi-service.js';
import { menuHTML, styleMenu } from '../services/layout.js';

const router = Router();

function cssId(s){ return String(s).replace(/[^a-zA-Z0-9]/g, '_'); }
function vignette(url){ if(!url) return null; return url.includes('?') ? url.replace('?','?width=140&') : url+'?width=140'; }

// Enregistrer les infos d'un fournisseur (adresse/téléphone)
router.post('/commandes/fournisseur', async (req, res) => {
  const { nom, adresse, telephone } = req.body || {};
  if (!nom) return res.status(400).json({ ok:false });
  res.json({ ok: await setFournisseur(nom, adresse, telephone) });
});

// Le patron coche/décoche "récupéré" -> statut fini (ou retour en_attente)
router.post('/commandes/recupere', async (req, res) => {
  const { ids, recupere } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ ok:false });
  res.json({ ok: await setStatut(ids, recupere ? 'fini' : 'en_attente') });
});

router.get('/commandes', async (req, res) => {
  const parFournisseur = await getCommandesAvecSuivi();
  const infos = await lireFournisseurs();

  // pastille d'état d'une référence
  function pastille(r) {
    if (r.couleursRupture && r.couleursRupture.length) {
      return `<span class="past rupt">🔴 rupture : ${r.couleursRupture.join(', ')}</span>`;
    }
    if (r.statut === 'fini')      return '<span class="past fini">⚫ récupéré</span>';
    if (r.statut === 'en_attente') return '<span class="past resa">🟢 réservé / en attente</span>';
    return '<span class="past todo">⚪ à commander</span>';
  }

  // rend un onglet : garde seulement les références dont le statut correspond
  function renderContenu(estRecupere) {
    const fournisseurs = Object.keys(parFournisseur).sort();
    // filtrer les références de chaque fournisseur selon récupéré ou non
    const fAvecRefs = fournisseurs
      .map((f) => [f, Object.values(parFournisseur[f]).filter((r) => (r.statut === 'fini') === estRecupere)])
      .filter(([, refs]) => refs.length > 0);

    if (fAvecRefs.length === 0) {
      return `<div class="vide">${estRecupere ? 'Rien de récupéré pour le moment.' : 'Aucune commande à acheter.'}</div>`;
    }

    return fAvecRefs.map(([f, refs]) => {
        const info = infos[f] || { adresse:'', telephone:'' };

        const blocs = refs.map((r) => {
          const img = vignette(r.image);
          const imgHtml = img ? `<img class="vig" src="${img}" data-full="${r.image}" alt="">` : '<div class="vig noimg">—</div>';
          const variantes = Object.entries(r.variantes).map(([v,q]) => `<span class="var">${v} ×${q}</span>`).join(' ');
          return `
            <div class="ref ${r.couleursRupture && r.couleursRupture.length ? 'has-rupt':''}">
              ${imgHtml}
              <div class="refinfo">
                <div class="refnum">RÉF ${r.reference} <span class="tot">· ${r.totalPieces} pièce(s)</span></div>
                <div class="reftitre">${r.titre}</div>
                <div class="variantes">${variantes}</div>
                ${r.note ? `<div class="note">📝 ${r.note}</div>` : ''}
              </div>
              <div class="etat">
                ${pastille(r)}
                <label class="recup">
                  <input type="checkbox" ${r.statut === 'fini' ? 'checked' : ''}
                    onchange="cocherRecup('${r.ids.join(',')}', this.checked)">
                  <span>récupéré</span>
                </label>
              </div>
            </div>`;
        }).join('');

        // format d'appel international : +33... (le 0 initial FR remplacé par +33)
        let telAppel = (info.telephone||'').replace(/[^0-9+]/g,'');
        if (telAppel.startsWith('0')) telAppel = '+33' + telAppel.slice(1);
        else if (telAppel.startsWith('33')) telAppel = '+' + telAppel;
        const tel = info.telephone ? `<a href="tel:${telAppel}" class="tel">📞 ${info.telephone}</a>` : '';

        return `<div class="fourn">
          <div class="fournhead">
            <h3>${f}</h3>
            <button class="infobtn" onclick="toggleInfo('${cssId(f)}')">ℹ️ infos</button>
            ${tel}
          </div>
          <div class="infobox" id="info-${cssId(f)}" style="display:none;">
            <label>Adresse<textarea data-f="${f}" class="fadr">${info.adresse||''}</textarea></label>
            <label>Téléphone<input data-f="${f}" class="ftel" value="${info.telephone||''}"></label>
            <button class="save" onclick="saveInfo('${f}','${cssId(f)}')">💾 Enregistrer</button>
          </div>
          <div class="refs">${blocs}</div>
        </div>`;
      }).join('');
  }

  const htmlAAcheter = renderContenu(false);
  const htmlRecupere = renderContenu(true);

  res.send(`<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>À acheter</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f5f5f7;color:#1a1a1a;}
  header{background:#0a6b3f;color:#fff;padding:18px 24px;}
  header h1{margin:0;font-size:19px;}
  .wrap{max-width:900px;margin:0 auto;padding:20px;}
  .tabs{display:flex;gap:8px;padding:16px 20px 0;max-width:900px;margin:0 auto;}
  .tab{flex:1;padding:12px;text-align:center;background:#e8e8ea;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;color:#555;}
  .tab.active{background:#0a6b3f;color:#fff;}
  .fourn{margin-bottom:20px;border:1px solid #eee;border-radius:12px;overflow:hidden;background:#fff;}
  .fournhead{display:flex;align-items:center;gap:12px;background:#fafafa;padding:12px 14px;flex-wrap:wrap;}
  .fournhead h3{margin:0;font-size:16px;color:#0a6b3f;}
  .infobtn{background:#eef0f2;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;}
  .tel{margin-left:auto;color:#0a6b3f;text-decoration:none;font-weight:600;font-size:14px;}
  .infobox{padding:12px 14px;background:#f0f7f3;display:flex;flex-direction:column;gap:8px;}
  .infobox label{font-size:12px;color:#555;display:flex;flex-direction:column;gap:4px;}
  .infobox textarea,.infobox input{padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px;font-family:inherit;}
  .save{align-self:flex-start;background:#0a6b3f;color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;}
  .refs{padding:8px 14px 14px;}
  .ref{display:flex;gap:12px;align-items:center;padding:10px;border-radius:10px;margin:6px 0;background:#fafafa;}
  .ref.has-rupt{background:#fef4f4;border:1px solid #f5c6c6;}
  .vig{width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:zoom-in;flex-shrink:0;border:1px solid #eee;}
  .vig.noimg{display:flex;align-items:center;justify-content:center;color:#ccc;background:#f0f0f0;}
  .refinfo{flex:1;min-width:0;}
  .refnum{font-weight:700;font-size:15px;} .tot{color:#888;font-weight:400;font-size:13px;}
  .reftitre{font-size:13px;color:#555;margin:2px 0;}
  .variantes{font-size:12px;} .var{display:inline-block;background:#eef0f2;padding:2px 7px;border-radius:5px;margin:1px 2px 0 0;}
  .note{font-size:12px;color:#7a5;margin-top:4px;font-style:italic;}
  .etat{flex-shrink:0;text-align:right;}
  .past{display:inline-block;padding:5px 10px;border-radius:8px;font-size:12px;font-weight:600;white-space:nowrap;}
  .past.todo{background:#eef0f2;color:#666;}
  .past.resa{background:#e6f4ec;color:#0a6b3f;}
  .past.rupt{background:#fde8e8;color:#b42318;}
  .past.fini{background:#e8e8ea;color:#555;}
  .recup{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:#666;cursor:pointer;margin-top:8px;}
  .recup input{width:22px;height:22px;cursor:pointer;}
  .vide{text-align:center;padding:50px;color:#999;}
  ${styleMenu()}

  /* ADAPTATION MOBILE : sur petit écran, on empile proprement */
  @media (max-width: 640px) {
    .ref { flex-wrap: wrap; }
    .vig { width: 70px; height: 70px; }
    .refinfo { flex: 1 1 calc(100% - 82px); min-width: 0; }
    .refnum { font-size: 15px; word-break: normal; }
    .reftitre { font-size: 13px; }
    .etat { flex: 1 1 100%; text-align: left; display: flex; align-items: center; gap: 16px; margin-top: 6px; padding-left: 82px; }
    .recup { flex-direction: row; margin-top: 0; }
    .past { white-space: normal; }
    .fournhead { gap: 8px; }
    .fournhead h3 { font-size: 15px; }
    .tel { margin-left: 0; flex-basis: 100%; }
  }
  #lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;}
  #lb img{max-width:90%;max-height:90%;border-radius:8px;}
</style></head><body>
  ${menuHTML('/commandes')}
  <header><h1>🛒 Commandes</h1></header>
  <div class="tabs">
    <button class="tab active" id="t-a" onclick="showTab('a')">À acheter</button>
    <button class="tab" id="t-r" onclick="showTab('r')">Déjà récupéré</button>
  </div>
  <div class="wrap">
    <div id="p-a">${htmlAAcheter}</div>
    <div id="p-r" style="display:none;">${htmlRecupere}</div>
  </div>
  <div id="lb" onclick="this.style.display='none'"><img id="lbimg" src=""></div>
  <script>
    function toggleInfo(id){var b=document.getElementById('info-'+id);b.style.display=b.style.display==='none'?'flex':'none';}
    async function saveInfo(nom,id){
      const adr=document.querySelector('.fadr[data-f="'+nom+'"]').value;
      const tel=document.querySelector('.ftel[data-f="'+nom+'"]').value;
      await fetch('/commandes/fournisseur',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nom,adresse:adr,telephone:tel})});
      location.reload();
    }
    function showTab(t){
      document.getElementById('p-a').style.display = t==='a'?'block':'none';
      document.getElementById('p-r').style.display = t==='r'?'block':'none';
      document.getElementById('t-a').classList.toggle('active', t==='a');
      document.getElementById('t-r').classList.toggle('active', t==='r');
      history.replaceState(null,'','#'+t);
    }
    (function(){ const t=(location.hash||'#a').slice(1); if(['a','r'].includes(t)) showTab(t); })();
    async function cocherRecup(idsStr, recupere){
      await fetch('/commandes/recupere',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ids:idsStr.split(','),recupere})});
      location.reload();
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