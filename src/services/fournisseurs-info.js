// services/fournisseurs-info.js
// Infos fournisseurs (adresse/téléphone) — stockées dans Supabase (table "fournisseurs").

import { supabase } from './supabase-client.js';

// renvoie { "NOM": { adresse, telephone } }
export async function lireFournisseurs() {
  try {
    const { data, error } = await supabase
      .from('fournisseurs')
      .select('nom, adresse, telephone');
    if (error) throw error;
    const map = {};
    for (const r of data || []) map[r.nom] = { adresse: r.adresse || '', telephone: r.telephone || '' };
    return map;
  } catch (err) {
    console.error('[fournisseurs] lecture :', err.message);
    return {};
  }
}

export async function setFournisseur(nom, adresse, telephone) {
  try {
    const { error } = await supabase.from('fournisseurs').upsert({
      nom,
      adresse: adresse || '',
      telephone: telephone || '',
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[fournisseurs] écriture :', err.message);
    return false;
  }
}