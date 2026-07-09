// services/journal.js
// Journal des checks — stocké dans Supabase (table "historique").
// Mêmes fonctions qu'avant (lireJournal / ajouterEntree) pour ne rien casser ailleurs.

import { supabase } from './supabase-client.js';

export async function lireJournal() {
  try {
    const { data, error } = await supabase
      .from('historique')
      .select('*')
      .order('date', { ascending: false })
      .limit(1000);
    if (error) throw error;
    // remettre au format attendu par les pages (date en string ISO)
    return (data || []).map((r) => ({
      date: r.date,
      mode: r.mode,
      totalVerifies: r.total_verifies,
      alerte: r.alerte,
      produits: r.produits || [],
    }));
  } catch (err) {
    console.error('[journal] lecture Supabase :', err.message);
    return [];
  }
}

export async function ajouterEntree(entree) {
  try {
    const { error } = await supabase.from('historique').insert({
      date: new Date().toISOString(),
      mode: entree.mode,
      total_verifies: entree.totalVerifies,
      alerte: !!entree.alerte,
      produits: entree.produits || [],
    });
    if (error) throw error;
  } catch (err) {
    console.error('[journal] écriture Supabase :', err.message);
  }
}