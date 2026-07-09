// server.js
// Point d'entree du backend. Lance un mini-serveur qui ecoute la modale de l'extension.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import importRoute from './routes/import.js';
import checkRoute from './routes/check.js';
import historiqueRoute from './routes/historique.js';
import commandesRoute from './routes/commandes.js';
import accueilRoute from './routes/accueil.js';

const app = express();
const PORT = process.env.PORT || 3000;

// L'extension Chrome enverra ses requetes depuis la page fournisseur :
// on autorise le cross-origin et on accepte de gros paquets (images en base64 plus tard).
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Route de sante : pour verifier d'un coup d'oeil que le serveur tourne.
app.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Backend en ligne', date: new Date().toISOString() });
});

// La route principale appelee par la modale.
app.use('/', importRoute);
app.use('/', checkRoute);
app.use('/', historiqueRoute);
app.use('/', checkRoute);
app.use('/', historiqueRoute);
app.use('/', commandesRoute);
app.use('/', accueilRoute);

app.listen(PORT, () => {
  console.log('───────────────────────────────────────────');
  console.log(`  Backend import-tool demarre`);
  console.log(`  → http://localhost:${PORT}/ping  (test)`);
  console.log(`  → POST http://localhost:${PORT}/import-produit`);
  console.log('───────────────────────────────────────────');
});
