// services/shopify-auth.js
// Recupere un token d'acces Shopify (shpat_) a partir du client_id + client_secret,
// selon la methode "client_credentials" du Dev Dashboard.
// Le token est valable ~24h : on le garde en cache et on le redemande quand il expire.

let tokenCache = null;       // { token, expiresAt }

export async function getToken() {
  const store = process.env.SHOPIFY_STORE;          // ex: zu5qny-mj.myshopify.com
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!store || !clientId || !clientSecret) {
    throw new Error('Variables Shopify manquantes (SHOPIFY_STORE / CLIENT_ID / CLIENT_SECRET).');
  }

  // Token encore valide ? (avec 60s de marge)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.token;
  }

  // Sinon : demander un nouveau token
  const url = `https://${store}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const rep = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!rep.ok) {
    const texte = await rep.text();
    throw new Error(`Auth Shopify echouee (${rep.status}) : ${texte}`);
  }

  const data = await rep.json();
  if (!data.access_token) {
    throw new Error('Reponse Shopify sans access_token : ' + JSON.stringify(data));
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
  };

  console.log(`   [shopify] token obtenu (scope: ${data.scope || '?'})`);
  return tokenCache.token;
}

// Helper : appelle l'API GraphQL Admin de Shopify avec le token.
export async function shopifyGraphQL(query, variables = {}) {
  const store = process.env.SHOPIFY_STORE;
  const token = await getToken();
  const version = '2026-01'; // version stable de l'API Admin

  const rep = await fetch(`https://${store}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await rep.json();
  if (data.errors) {
    throw new Error('GraphQL erreur : ' + JSON.stringify(data.errors));
  }
  return data.data;
}
