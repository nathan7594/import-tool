// server.js
// Point d'entree du backend. Lance un mini-serveur qui ecoute la modale de l'extension
// et sert l'interface web (accueil, historique, commandes), protegee par mot de passe.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import importRoute from './routes/import.js';
import checkRoute from './routes/check.js';
import historiqueRoute from './routes/historique.js';
import commandesRoute from './routes/commandes.js';
import accueilRoute from './routes/accueil.js';
import { protection, traiterLogin } from './services/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// L'extension Chrome enverra ses requetes depuis la page fournisseur :
// on autorise le cross-origin et on accepte de gros paquets (images en base64).
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true })); // pour lire le formulaire de login

// ── Routes PUBLIQUES (accessibles sans mot de passe) ──
// Sante : verifier d'un coup d'oeil que le serveur tourne.
app.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Backend en ligne', date: new Date().toISOString() });
});
// Connexion
app.post('/login', traiterLogin);

// ── A partir d'ici, TOUT est protege par mot de passe ──
app.use(protection);

// ── Routes PROTEGEES ──
app.use('/', importRoute);
app.use('/', checkRoute);
app.use('/', historiqueRoute);
app.use('/', commandesRoute);
app.use('/', accueilRoute);

app.listen(PORT, () => {
  console.log('───────────────────────────────────────────');
  console.log(`  Backend import-tool demarre`);
  console.log(`  → http://localhost:${PORT}/ping  (test)`);
  console.log(`  → http://localhost:${PORT}/  (interface)`);
  console.log('───────────────────────────────────────────');
});