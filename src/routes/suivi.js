// routes/suivi.js
// Page SUIVI (pour toi) : piloter les états des commandes fournisseurs.
// 3 onglets : À commander / En attente / Fini. Réservé/rupture par couleur + notes.

import { Router } from 'express';
import { getCommandesAvecSuivi } from '../services/commandes-service.js';
import { setStatut, setRupture, setNote } from '../services/suivi-service.js';
import { lireFournisseurs, setFournisseur } from '../services/fournisseurs-info.js';
import { menuHTML, styleMenu } from '../services/layout.js';

const router = Router();

function cssId(s){ return String(s).replace(/[^a-zA-Z0-9]/g, '_'); }
function vignette(url){ if(!url) return null; return url.includes('?') ? url.replace('?','?width=140&') : url+'?width=140'; }

// ── Actions (appelées en AJAX depuis la page) ──
router.post('/suivi/statut', async (req, res) => {
  const { ids, statut } = req.body || {};
  if (!Array.isArray(ids) || !statut) return res.status(400).json({ ok:false });
  res.json({ ok: await setStatut(ids, statut) });
});
router.post('/suivi/rupture', async (req, res) => {
  const { ids, couleur, enRupture } = req.body || {};
  if (!Array.isArray(ids) || !couleur) return res.status(400).json({ ok:false });
  // applique la rupture à toutes les ventes de la référence
  let ok = true;
  for (const id of ids) ok = await setRupture(id, couleur, !!enRupture) && ok;
  res.json({ ok });
});
router.post('/suivi/fournisseur', async (req, res) => {
  const { nom, adresse, telephone } = req.body || {};
  if (!nom) return res.status(400).json({ ok:false });
  res.json({ ok: await setFournisseur(nom, adresse, telephone) });
});
router.post('/suivi/note', async (req, res) => {
  const { ids, note } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ ok:false });
  let ok = true;
  for (const id of ids) ok = await setNote(id, note || '') && ok;
  res.json({ ok });
});

router.get('/suivi', async (req, res) => {
  const parFournisseur = await getCommandesAvecSuivi();
  const infos = await lireFournisseurs();

  // aplatir en liste de références avec leur fournisseur
  const toutesRefs = [];
  for (const [fournisseur, refs] of Object.entries(parFournisseur)) {
    for (const e of Object.values(refs)) {
      toutesRefs.push({ fournisseur, ...e });
    }
  }

  // répartir par statut
  const aCommander = toutesRefs.filter((r) => r.statut === 'a_commander');
  const enAttente  = toutesRefs.filter((r) => r.statut === 'en_attente');
  const fini       = toutesRefs.filter((r) => r.statut === 'fini');

  // rendu d'une carte référence
  function carteRef(r, onglet) {
    const img = vignette(r.image);
    const imgHtml = img ? `<img class="vig" src="${img}" data-full="${r.image}" alt="">` : '<div class="vig noimg">—</div>';
    const variantes = Object.entries(r.variantes)
      .map(([v,q]) => `<span class="var">${v} ×${q}</span>`).join(' ');
    const idsAttr = r.ids.join(',');

    // pastilles couleurs avec état réservé/rupture (onglet en_attente surtout)
    const couleursHtml = r.couleurs.map((c) => {
      const rupt = r.couleursRupture.includes(c);
      return `<button class="coul ${rupt?'rupt':'ok'}"
        onclick="toggleRupture('${idsAttr}','${c.replace(/'/g,"")}', ${rupt?'false':'true'})">
        ${rupt ? '🔴' : '🟢'} ${c}</button>`;
    }).join(' ');

    // boutons d'action selon l'onglet
    let actions = '';
    if (onglet === 'a_commander') {
      actions = `<button class="act envoyer" onclick="changerStatut('${idsAttr}','en_attente')">📤 Envoyé → attente</button>`;
    } else if (onglet === 'en_attente') {
      actions = `
        <div class="couleurs">${couleursHtml}</div>
        <button class="act fini" onclick="changerStatut('${idsAttr}','fini')">✅ Terminé</button>
        <button class="act retour" onclick="changerStatut('${idsAttr}','a_commander')">↩ à commander</button>`;
    } else {
      actions = `<button class="act retour" onclick="changerStatut('${idsAttr}','en_attente')">↩ rouvrir</button>`;
    }

    return `
      <div class="ref ${r.couleursRupture.length ? 'has-rupt':''}">
        ${imgHtml}
        <div class="refinfo">
          <div class="refnum">RÉF ${r.reference} <span class="tot">· ${r.totalPieces} pièce(s)</span></div>
          <div class="reftitre">${r.titre}</div>
          <div class="variantes">${variantes}</div>
          ${actions}
          <div class="note">
            <input type="text" placeholder="Note (ex: revient jeudi, que en bleu...)"
              value="${(r.note||'').replace(/"/g,'&quot;')}"
              onblur="sauverNote('${idsAttr}', this.value)">
          </div>
        </div>
      </div>`;
  }

  function renderListe(liste, onglet) {
    if (!liste.length) return '<div class="vide">Rien ici.</div>';
    // grouper par fournisseur
    const parF = {};
    for (const r of liste) (parF[r.fournisseur] ||= []).push(r);
    return Object.entries(parF).map(([f, refs]) => {
      const info = infos[f] || {};
      let num = (info.telephone||'').replace(/[^0-9]/g,'');
      if (num.startsWith('0')) num = '33'+num.slice(1);
      // message whatsapp pour l'onglet à commander
      let wa = '';
      if (onglet === 'a_commander' && info.telephone) {
        const lignesMsg = refs.map((r) => {
          const vs = Object.entries(r.variantes).map(([v,q]) => `${v} x${q}`).join(', ');
          return `- ${r.reference} : ${vs}`;
        }).join('\n');
        const msg = `Bonjour, c'est Edmond Boublil de Envy de Live.\nVoici les pièces dont j'ai besoin :\n\n${lignesMsg}\n\nMerci de me les mettre de côté, je viens les chercher.`;
        wa = `<a class="wabtn" target="_blank" href="https://wa.me/${num}?text=${encodeURIComponent(msg)}">📱 WhatsApp</a>`;
      }
      // format d'appel international
      let telAppel = (info.telephone||'').replace(/[^0-9+]/g,'');
      if (telAppel.startsWith('0')) telAppel = '+33' + telAppel.slice(1);
      else if (telAppel.startsWith('33')) telAppel = '+' + telAppel;
      const telBtn = info.telephone ? `<a href="tel:${telAppel}" class="telbtn">📞 ${info.telephone}</a>` : '';
      const cid = cssId(f);
      return `<div class="fourn">
        <div class="fournhead">
          <h3>${f}</h3>
          <button class="infobtn" onclick="toggleInfo('${cid}')">ℹ️ infos</button>
          ${wa}
          ${telBtn}
        </div>
        <div class="infobox" id="info-${cid}" style="display:none;">
          <label>Adresse<textarea data-f="${f}" class="fadr">${info.adresse||''}</textarea></label>
          <label>Téléphone<input data-f="${f}" class="ftel" value="${info.telephone||''}"></label>
          <button class="saveinfo" onclick="saveInfo('${f}','${cid}')">💾 Enregistrer</button>
        </div>
        ${refs.map((r) => carteRef(r, onglet)).join('')}
      </div>`;
    }).join('');
  }

  res.send(`<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Suivi commandes</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f5f5f7;color:#1a1a1a;}
  header{background:#0a6b3f;color:#fff;padding:18px 24px;}
  header h1{margin:0;font-size:19px;}
  .tabs{display:flex;gap:6px;padding:14px 20px 0;max-width:900px;margin:0 auto;}
  .tab{flex:1;padding:12px 8px;text-align:center;background:#e8e8ea;border:none;border-radius:10px 10px 0 0;font-size:14px;font-weight:600;cursor:pointer;color:#555;}
  .tab.active{background:#fff;color:#0a6b3f;}
  .tab .n{display:inline-block;background:#0a6b3f;color:#fff;border-radius:10px;padding:0 7px;font-size:12px;margin-left:4px;}
  .wrap{max-width:900px;margin:0 auto;padding:0 20px 40px;}
  .panel{background:#fff;border-radius:0 0 12px 12px;padding:14px;min-height:200px;}
  .fourn{margin-bottom:20px;border:1px solid #eee;border-radius:12px;overflow:hidden;}
  .fournhead{display:flex;align-items:center;gap:12px;background:#fafafa;padding:10px 14px;}
  .fournhead h3{margin:0;font-size:16px;color:#0a6b3f;}
  .wabtn{margin-left:auto;background:#25d366;color:#fff;border-radius:8px;padding:6px 12px;font-size:13px;text-decoration:none;font-weight:600;}
  .infobtn{background:#eef0f2;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;}
  .telbtn{color:#0a6b3f;text-decoration:none;font-weight:600;font-size:14px;}
  .infobox{padding:12px 14px;background:#f0f7f3;display:flex;flex-direction:column;gap:8px;margin:0 8px 8px;border-radius:10px;}
  .infobox label{font-size:12px;color:#555;display:flex;flex-direction:column;gap:4px;}
  .infobox textarea,.infobox input{padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px;font-family:inherit;}
  .saveinfo{align-self:flex-start;background:#0a6b3f;color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;}
  .ref{display:flex;gap:12px;padding:12px;border-radius:10px;margin:8px;background:#fafafa;}
  .ref.has-rupt{background:#fef4f4;border:1px solid #f5c6c6;}
  .vig{width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:zoom-in;flex-shrink:0;border:1px solid #eee;}
  .vig.noimg{display:flex;align-items:center;justify-content:center;color:#ccc;background:#f0f0f0;}
  .refinfo{flex:1;min-width:0;}
  .refnum{font-weight:700;font-size:15px;} .tot{color:#888;font-weight:400;font-size:13px;}
  .reftitre{font-size:13px;color:#555;margin:2px 0;}
  .variantes{font-size:12px;margin-bottom:8px;} .var{display:inline-block;background:#eef0f2;padding:2px 7px;border-radius:5px;margin:1px 2px 0 0;}
  .couleurs{margin:8px 0;} .coul{border:none;border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer;margin:2px;font-weight:600;}
  .coul.ok{background:#e6f4ec;color:#0a6b3f;} .coul.rupt{background:#fde8e8;color:#b42318;}
  .act{border:none;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;margin:3px 4px 3px 0;font-weight:600;}
  .act.envoyer{background:#0a6b3f;color:#fff;} .act.fini{background:#0a6b3f;color:#fff;}
  .act.retour{background:#eef0f2;color:#555;}
  .note{margin-top:8px;} .note input{width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;font-size:13px;}
  .vide{text-align:center;padding:50px;color:#999;}
  ${styleMenu()}
  #lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;}
  #lb img{max-width:90%;max-height:90%;border-radius:8px;}
</style></head><body>
  ${menuHTML('/suivi')}
  <header><h1>📋 Suivi des commandes</h1></header>
  <div class="tabs">
    <button class="tab active" id="t-a" onclick="showTab('a')">À commander<span class="n">${aCommander.length}</span></button>
    <button class="tab" id="t-e" onclick="showTab('e')">En attente<span class="n">${enAttente.length}</span></button>
    <button class="tab" id="t-f" onclick="showTab('f')">Fini<span class="n">${fini.length}</span></button>
  </div>
  <div class="wrap">
    <div class="panel" id="p-a">${renderListe(aCommander,'a_commander')}</div>
    <div class="panel" id="p-e" style="display:none;">${renderListe(enAttente,'en_attente')}</div>
    <div class="panel" id="p-f" style="display:none;">${renderListe(fini,'fini')}</div>
  </div>
  <div id="lb" onclick="this.style.display='none'"><img id="lbimg" src=""></div>
  <script>
    function showTab(t){
      for(const x of ['a','e','f']){
        document.getElementById('p-'+x).style.display = x===t?'block':'none';
        document.getElementById('t-'+x).classList.toggle('active', x===t);
      }
      history.replaceState(null,'', '#'+t); // mémorise l'onglet dans l'URL
    }
    // au chargement, revenir sur l'onglet mémorisé
    (function(){ const t=(location.hash||'#a').slice(1); if(['a','e','f'].includes(t)) showTab(t); })();
    function toggleInfo(id){var b=document.getElementById('info-'+id);b.style.display=b.style.display==='none'?'flex':'none';}
    async function saveInfo(nom,id){
      const adr=document.querySelector('.fadr[data-f="'+nom+'"]').value;
      const tel=document.querySelector('.ftel[data-f="'+nom+'"]').value;
      await fetch('/suivi/fournisseur',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nom,adresse:adr,telephone:tel})});
      location.reload();
    }
    async function changerStatut(idsStr, statut){
      await fetch('/suivi/statut',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ids:idsStr.split(','),statut})});
      location.reload(); // le hash (#onglet) est conservé automatiquement
    }
    async function toggleRupture(idsStr, couleur, enRupture){
      await fetch('/suivi/rupture',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ids:idsStr.split(','),couleur,enRupture})});
      location.reload();
    }
    async function sauverNote(idsStr, note){
      await fetch('/suivi/note',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ids:idsStr.split(','),note})});
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