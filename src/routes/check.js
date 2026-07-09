// routes/check.js
// Route du CHECK de disponibilité PFS.
//
//   1. GET  /check/produits   → liste les produits à surveiller (pfs_url + check=on)
//   2. POST /check/resultats  → reçoit les verdicts de l'extension, imprime le rapport,
//                               ET applique les actions de stock (0 si rupture/<5, 3 si dispo).
//
// SÉCURITÉ : le mode est piloté par le body { dryRun: true|false } envoyé par l'extension.
//   - dryRun: true  → simulation : montre ce qui SERAIT fait, ne modifie RIEN sur Shopify
//   - dryRun: false → applique réellement les stocks
// Par défaut (si non précisé) → dryRun: true (on ne touche à rien sans le vouloir).

import { Router } from 'express';
import { shopifyGraphQL } from '../services/shopify-auth.js';
import { appliquerActions } from '../services/check-actions.js';
import { ajouterEntree } from '../services/journal.js';

const router = Router();

// ─────────────────────────────────────────────────────────────
// 1. Liste des produits à surveiller
// ─────────────────────────────────────────────────────────────
router.get('/check/produits', async (req, res) => {
  try {
    const produits = [];
    let cursor = null;
    let encore = true;

    while (encore) {
      const data = await shopifyGraphQL(`
        query($cursor: String) {
          products(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                title
                status
                pfsUrl: metafield(namespace: "custom", key: "pfs_url") { value }
                check:  metafield(namespace: "custom", key: "check")   { value }
              }
            }
          }
        }
      `, { cursor });

      const edges = data.products?.edges || [];
      for (const { node } of edges) {
        const url = node.pfsUrl?.value?.trim();
        const flag = (node.check?.value || '').trim().toLowerCase();
        if (url && flag === 'on') {
          produits.push({ id: node.id, titre: node.title, statut: node.status, pfsUrl: url });
        }
      }

      encore = data.products?.pageInfo?.hasNextPage;
      cursor = data.products?.pageInfo?.endCursor;
    }

    console.log(`[check] ${produits.length} produit(s) à surveiller`);
    res.json({ ok: true, total: produits.length, produits });
  } catch (err) {
    console.error('[check] Erreur liste produits :', err.message);
    res.status(500).json({ ok: false, erreur: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Réception des verdicts + APPLICATION des actions de stock
// ─────────────────────────────────────────────────────────────
router.post('/check/resultats', async (req, res) => {
  try {
    const resultats = req.body?.resultats;
    // dryRun par défaut = true (sécurité : on ne modifie rien sans le demander)
    const dryRun = req.body?.dryRun !== false;

    if (!Array.isArray(resultats)) {
      return res.status(400).json({ ok: false, erreur: 'resultats manquant ou invalide' });
    }

    // ── Tri des verdicts pour le rapport ──
    const morts = [];
    const partiels = [];
    const ok = [];
    const erreurs = [];

    for (const r of resultats) {
      const v = r.verdict || {};
      if (v.erreur) { erreurs.push(r); continue; }
      if (!v.vivant) { morts.push(r); continue; }
      const aProbleme = (v.variantes || []).some((x) => x.etat === 'rupture' || x.etat === 'faible');
      if (aProbleme) partiels.push(r); else ok.push(r);
    }

    // ── Rapport console ──
    console.log('\n═══════════ RAPPORT CHECK PFS ═══════════');
    console.log(`Mode : ${dryRun ? '🔒 SIMULATION (rien modifié)' : '⚡ APPLICATION RÉELLE'}`);
    console.log(`Total vérifiés : ${resultats.length}`);
    console.log(`✅ OK dispo      : ${ok.length}`);
    console.log(`🟠 Partiels      : ${partiels.length}`);
    console.log(`☠️  Morts (PFS)   : ${morts.length}`);
    if (erreurs.length) console.log(`⚠️  Erreurs fetch : ${erreurs.length}`);
    console.log('─────────────────────────────────────────');

    // ── APPLICATION des actions de stock ──
    console.log('Actions de stock :');
    const actionRapport = await appliquerActions(resultats, { dryRun });
    console.log('═════════════════════════════════════════\n');

    // ── ENREGISTREMENT dans le journal (fichier disque, permanent) ──
    // On garde TOUS les produits vérifiés avec leur niveau (vert/orange/rouge),
    // image, liens et détail — pour l'affichage dépliable et la vérification.
    const produitsJournal = (actionRapport.rapports || [])
      .filter((r) => !r.saute)
      .map((r) => ({
        produit: r.titre,
        niveau: r.niveau || 'vert',
        image: r.image || null,
        handle: r.handle || null,
        pfsUrl: r.pfsUrl || null,
        vivant: r.vivant !== false,
        changements: r.changements || [],
      }));

    await ajouterEntree({
      mode: dryRun ? 'simulation' : 'reel',
      totalVerifies: resultats.length,
      alerte: !!actionRapport.alerte,
      produits: produitsJournal,
    });

    res.json({
      ok: true,
      dryRun,
      resume: {
        total: resultats.length,
        ok: ok.length,
        partiels: partiels.length,
        morts: morts.length,
        erreurs: erreurs.length,
      },
      actions: actionRapport,
    });
  } catch (err) {
    console.error('[check] Erreur résultats :', err.message);
    res.status(500).json({ ok: false, erreur: err.message });
  }
});

export default router;