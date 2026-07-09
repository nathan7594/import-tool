// services/layout.js
// Éléments d'interface partagés par toutes les pages : le menu burger + le style commun.
// Chaque page appelle menuHTML() et styleCommun() pour avoir la même navigation.

// Les entrées du menu (un seul endroit à modifier pour ajouter une page)
const LIENS = [
  { url: '/', label: 'Accueil', icone: '🏠' },
  { url: '/historique', label: 'Historique des checks', icone: '📊' },
  { url: '/commandes', label: 'Commandes fournisseurs', icone: '🛒' },
];

// Le HTML du menu burger (bouton + panneau latéral)
export function menuHTML(urlActive = '') {
  const liens = LIENS.map((l) => {
    const actif = l.url === urlActive ? ' class="actif"' : '';
    return `<a href="${l.url}"${actif}><span>${l.icone}</span> ${l.label}</a>`;
  }).join('');

  return `
    <button id="burger" onclick="ouvrirMenu()" aria-label="Menu">☰</button>
    <div id="overlay" onclick="fermerMenu()"></div>
    <nav id="menu">
      <div class="menuhead">Menu</div>
      ${liens}
    </nav>
    <script>
      function ouvrirMenu(){document.getElementById('menu').classList.add('open');document.getElementById('overlay').classList.add('show');}
      function fermerMenu(){document.getElementById('menu').classList.remove('open');document.getElementById('overlay').classList.remove('show');}
    </script>`;
}

// Le CSS du menu (à inclure dans le <style> de chaque page)
export function styleMenu() {
  return `
    #burger{position:fixed;top:14px;left:14px;z-index:1000;background:rgba(255,255,255,.2);color:#fff;border:none;font-size:22px;width:42px;height:42px;border-radius:10px;cursor:pointer;line-height:1;}
    #burger:hover{background:rgba(255,255,255,.32);}
    #overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1001;opacity:0;pointer-events:none;transition:opacity .2s;}
    #overlay.show{opacity:1;pointer-events:auto;}
    #menu{position:fixed;top:0;left:0;bottom:0;width:260px;background:#fff;z-index:1002;transform:translateX(-100%);transition:transform .22s;box-shadow:2px 0 20px rgba(0,0,0,.15);padding:16px 0;}
    #menu.open{transform:translateX(0);}
    #menu .menuhead{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#999;padding:8px 20px 12px;}
    #menu a{display:flex;align-items:center;gap:12px;padding:14px 20px;color:#1a1a1a;text-decoration:none;font-size:15px;}
    #menu a:hover{background:#f5f5f7;}
    #menu a.actif{background:#e6f4ec;color:#0a6b3f;font-weight:600;}
    #menu a span{font-size:18px;}
    header{padding-left:68px !important;}`;
}