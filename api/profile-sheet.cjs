const { createHmac, randomBytes } = require('crypto');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function percentEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function restletUrl(accountId) {
  const host = `${accountId.toLowerCase().replace(/_/g, '-')}.restlets.api.netsuite.com`;
  return `https://${host}/app/site/hosting/restlet.nl`;
}

function queryValue(query, key) {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function parseNs(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text || 'empty NetSuite response' };
  }
}

async function callRestlet(method, query, body) {
  const accountId = required('NETSUITE_ACCOUNT_ID');
  const consumerKey = required('NETSUITE_CONSUMER_KEY');
  const consumerSecret = required('NETSUITE_CONSUMER_SECRET');
  const tokenId = required('NETSUITE_TOKEN_ID');
  const tokenSecret = required('NETSUITE_TOKEN_SECRET');
  const scriptId = process.env.NETSUITE_SCRIPT_ID || 'customscript_gn_rl_ps_dxf';
  const deployId = process.env.NETSUITE_DEPLOY_ID || 'customdeploy_gn_rl_ps_dxf';

  const url = restletUrl(accountId);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_token: tokenId,
    oauth_version: '1.0',
    script: scriptId,
    deploy: deployId,
    ...query,
  };
  const paramString = Object.keys(oauth)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(oauth[key])}`)
    .join('&');
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = createHmac('sha256', signingKey).update(baseString).digest('base64');

  const auth = [
    `realm="${percentEncode(accountId)}"`,
    `oauth_consumer_key="${percentEncode(consumerKey)}"`,
    `oauth_token="${percentEncode(tokenId)}"`,
    `oauth_signature_method="HMAC-SHA256"`,
    `oauth_timestamp="${timestamp}"`,
    `oauth_nonce="${percentEncode(nonce)}"`,
    `oauth_version="1.0"`,
    `oauth_signature="${percentEncode(signature)}"`,
  ].join(', ');

  const search = new URLSearchParams({ script: scriptId, deploy: deployId, ...query });
  const res = await fetch(`${url}?${search}`, {
    method,
    headers: {
      Authorization: `OAuth ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

module.exports = async function handler(req, res) {
  try {
    const method = req.method || 'GET';

    if (method === 'GET') {
      const id = queryValue(req.query, 'id');
      if (!id) {
        send(res, 400, { ok: false, error: 'id required' });
        return;
      }
      const ns = await callRestlet('GET', { id });
      const parsed = parseNs(ns.text);
      send(res, ns.status >= 400 || parsed.ok === false ? 400 : 200, parsed);
      return;
    }

    if (method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (!body.id) {
        send(res, 400, { ok: false, error: 'id required' });
        return;
      }
      const ns = await callRestlet('PUT', {}, { id: body.id, dxf: body.dxf ?? '' });
      const parsed = parseNs(ns.text);
      send(res, ns.status >= 400 || parsed.ok === false ? 400 : 200, parsed);
      return;
    }

    send(res, 405, { ok: false, error: 'GET or PUT only' });
  } catch (error) {
    send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
