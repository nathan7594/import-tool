// services/suivi-service.js
// Gère l'état de suivi de chaque vente (statut + couleurs en rupture + note).
// Stocké dans Supabase (table suivi_commandes).

import { supabase } from './supabase-client.js';

// Lit tout le suivi -> { "vente_id": { statut, couleurs_rupture:[], note } }
export async function lireSuivi() {
  try {
    const { data, error } = await supabase
      .from('suivi_commandes')
      .select('vente_id, statut, couleurs_rupture, note');
    if (error) throw error;
    const map = {};
    for (const r of data || []) {
      map[r.vente_id] = {
        statut: r.statut || 'a_commander',
        couleurs_rupture: r.couleurs_rupture || [],
        note: r.note || '',
      };
    }
    return map;
  } catch (err) {
    console.error('[suivi] lecture :', err.message);
    return {};
  }
}

// Change le statut d'une ou plusieurs ventes (a_commander | en_attente | fini)
export async function setStatut(ids, statut) {
  try {
    const rows = ids.map((id) => ({ vente_id: id, statut, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('suivi_commandes').upsert(rows);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[suivi] setStatut :', err.message);
    return false;
  }
}

// Marque une couleur en rupture (ou l'enlève) pour une vente
export async function setRupture(id, couleur, enRupture) {
  try {
    // lire l'état actuel
    const { data } = await supabase
      .from('suivi_commandes')
      .select('couleurs_rupture')
      .eq('vente_id', id)
      .maybeSingle();
    let couleurs = (data?.couleurs_rupture) || [];
    if (enRupture) {
      if (!couleurs.includes(couleur)) couleurs.push(couleur);
    } else {
      couleurs = couleurs.filter((c) => c !== couleur);
    }
    const { error } = await supabase.from('suivi_commandes').upsert({
      vente_id: id,
      couleurs_rupture: couleurs,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[suivi] setRupture :', err.message);
    return false;
  }
}

// Enregistre une note pour une vente
export async function setNote(id, note) {
  try {
    const { error } = await supabase.from('suivi_commandes').upsert({
      vente_id: id,
      note: note || '',
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[suivi] setNote :', err.message);
    return false;
  }
}