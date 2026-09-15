import type { IncomingMessage, ServerResponse } from 'node:http';
import { callRestlet, readTbaConfig } from './_lib/netsuiteTba';

type Req = IncomingMessage & { query?: Record<string, string | string[]>; body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

function queryValue(query: Req['query'], key: string): string {
  const value = query?.[key];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function send(res: Res, status: number, body: unknown) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(body);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: Req, res: Res) {
  try {
    const cfg = readTbaConfig();
    const method = req.method || 'GET';

    if (method === 'GET') {
      const id = queryValue(req.query, 'id');
      if (!id) {
        send(res, 400, { ok: false, error: 'id required' });
        return;
      }
      const ns = await callRestlet(cfg, 'GET', { id });
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
      const ns = await callRestlet(cfg, 'PUT', {}, { id: body.id, dxf: body.dxf ?? '' });
      const parsed = parseNs(ns.text);
      send(res, ns.status >= 400 || parsed.ok === false ? 400 : 200, parsed);
      return;
    }

    send(res, 405, { ok: false, error: 'GET or PUT only' });
  } catch (error) {
    send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function parseNs(text: string): { ok?: boolean; error?: string; [key: string]: unknown } {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text || 'empty NetSuite response' };
  }
}
