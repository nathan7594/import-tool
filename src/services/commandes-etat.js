// services/commandes-etat.js
// État acheté/pas des ventes — stocké dans Supabase (table "commandes_etat").

import { supabase } from './supabase-client.js';

// renvoie { "vente_id": true }
export async function lireEtats() {
  try {
    const { data, error } = await supabase
      .from('commandes_etat')
      .select('vente_id, achete');
    if (error) throw error;
    const map = {};
    for (const r of data || []) if (r.achete) map[r.vente_id] = true;
    return map;
  } catch (err) {
    console.error('[commandes-etat] lecture :', err.message);
    return {};
  }
}

// cocher (achete=true) ou décocher (achete=false) une liste d'ids
export async function setEtat(ids, achete) {
  try {
    if (achete) {
      // upsert des lignes achetées
      const rows = ids.map((id) => ({ vente_id: id, achete: true, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('commandes_etat').upsert(rows);
      if (error) throw error;
    } else {
      // décocher = supprimer les lignes
      const { error } = await supabase.from('commandes_etat').delete().in('vente_id', ids);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error('[commandes-etat] écriture :', err.message);
    return false;
  }
}