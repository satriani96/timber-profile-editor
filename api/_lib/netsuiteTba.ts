import { createHmac, randomBytes } from 'node:crypto';

export type TbaConfig = {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
  scriptId: string;
  deployId: string;
};

export function readTbaConfig(): TbaConfig {
  const accountId = required('NETSUITE_ACCOUNT_ID');
  return {
    accountId,
    consumerKey: required('NETSUITE_CONSUMER_KEY'),
    consumerSecret: required('NETSUITE_CONSUMER_SECRET'),
    tokenId: required('NETSUITE_TOKEN_ID'),
    tokenSecret: required('NETSUITE_TOKEN_SECRET'),
    scriptId: process.env.NETSUITE_SCRIPT_ID || 'customscript_gn_rl_ps_dxf',
    deployId: process.env.NETSUITE_DEPLOY_ID || 'customdeploy_gn_rl_ps_dxf',
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function restletUrl(accountId: string): string {
  const host = `${accountId.toLowerCase().replace(/_/g, '-')}.restlets.api.netsuite.com`;
  return `https://${host}/app/site/hosting/restlet.nl`;
}

export async function callRestlet(
  cfg: TbaConfig,
  method: 'GET' | 'PUT',
  query: Record<string, string>,
  body?: unknown
): Promise<{ status: number; text: string }> {
  const url = restletUrl(cfg.accountId);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const oauth: Record<string, string> = {
    oauth_consumer_key: cfg.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_token: cfg.tokenId,
    oauth_version: '1.0',
    script: cfg.scriptId,
    deploy: cfg.deployId,
    ...query,
  };
  const paramString = Object.keys(oauth)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(oauth[key])}`)
    .join('&');
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(cfg.consumerSecret)}&${percentEncode(cfg.tokenSecret)}`;
  const signature = createHmac('sha256', signingKey).update(baseString).digest('base64');

  const auth = [
    `realm="${percentEncode(cfg.accountId)}"`,
    `oauth_consumer_key="${percentEncode(cfg.consumerKey)}"`,
    `oauth_token="${percentEncode(cfg.tokenId)}"`,
    `oauth_signature_method="HMAC-SHA256"`,
    `oauth_timestamp="${timestamp}"`,
    `oauth_nonce="${percentEncode(nonce)}"`,
    `oauth_version="1.0"`,
    `oauth_signature="${percentEncode(signature)}"`,
  ].join(', ');

  const search = new URLSearchParams({ script: cfg.scriptId, deploy: cfg.deployId, ...query });
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
