// services/supabase-client.js
// Connexion centrale à Supabase, réutilisée par tous les modules.
// Utilise la SECRET key (accès serveur, contourne le RLS) — jamais côté navigateur.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error('[supabase] ⚠️ SUPABASE_URL ou SUPABASE_SECRET_KEY manquant dans .env');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false }, // backend : pas de session utilisateur
});