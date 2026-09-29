import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile?.(path.join(here, '.env')); } catch {}

export function loadConfig(env = process.env) {
  const environment = String(env.NFSE_ENV || 'restrita').toLowerCase() === 'producao' ? 'producao' : 'restrita';
  const cfg = {
    host: env.HOST || '127.0.0.1',
    port: Math.max(1, Number(env.PORT || 8787)),
    environment,
    allowProduction: String(env.ALLOW_PRODUCTION || '').toLowerCase() === 'true',
    certificatePath: env.NFSE_CERTIFICATE_PATH || '',
    certificatePassword: env.NFSE_CERTIFICATE_PASSWORD || '',
    apiKey: env.FISCAL_GATEWAY_API_KEY || '',
    allowedOrigins: String(env.FISCAL_ALLOWED_ORIGINS || '*').split(',').map(x => x.trim()).filter(Boolean),
    allowedCnpjs: String(env.NFSE_ALLOWED_CNPJS || '').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean),
    storageDir: path.resolve(here, env.FISCAL_STORAGE_DIR || './storage'),
    mock: String(env.FISCAL_GATEWAY_MOCK || '').toLowerCase() === 'true',
  };
  if (cfg.environment === 'producao' && !cfg.allowProduction) {
    cfg.productionLockReason = 'NFSE_ENV=producao exige ALLOW_PRODUCTION=true.';
  }
  return cfg;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function corsHeaders(req, cfg) {
  const origin = req.headers.origin || '';
  const allowed = cfg.allowedOrigins.includes('*') || !origin || cfg.allowedOrigins.includes(origin);
  return allowed ? {
    'Access-Control-Allow-Origin': cfg.allowedOrigins.includes('*') ? '*' : origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  } : {};
}

function send(res, status, body, extra = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), ...extra});
  res.end(data);
}

async function readJson(req, limit = 2_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Payload excede 2 MB'), {statusCode: 413});
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON inválido'), {statusCode: 400}); }
}

function authorized(req, cfg) {
  if (!cfg.apiKey) return true;
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') && safeEqual(auth.slice(7), cfg.apiKey);
}

function ensureStorage(cfg) { fs.mkdirSync(cfg.storageDir, {recursive: true}); }
function safeName(value) { return String(value || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100); }
function extractNumber(xml = '') { return /<nNFSe>([^<]+)<\/nNFSe>/.exec(xml)?.[1] || ''; }
function persistXml(cfg, key, xml, metadata = {}) {
  ensureStorage(cfg);
  const stem = safeName(key || `nfse_${Date.now()}`);
  const xmlPath = path.join(cfg.storageDir, `${stem}.xml`);
  const metaPath = path.join(cfg.storageDir, `${stem}.json`);
  fs.writeFileSync(xmlPath, xml, {encoding: 'utf8', mode: 0o600});
  fs.writeFileSync(metaPath, JSON.stringify({...metadata, storedAt: new Date().toISOString()}, null, 2), {encoding: 'utf8', mode: 0o600});
  return {xmlRef: `gateway://storage/${stem}.xml`, metaRef: `gateway://storage/${stem}.json`};
}

let sdkPromise;
async function sdk() {
  sdkPromise ||= import('@useinvio/nfse-sdk');
  return sdkPromise;
}

function certificateConfigured(cfg) {
  return !!(cfg.certificatePath && cfg.certificatePassword && fs.existsSync(cfg.certificatePath));
}
function checkCnpj(invoice, cfg) {
  const cnpj = String(invoice?.prestador?.cnpj || '').replace(/\D/g, '');
  if (cfg.allowedCnpjs.length && !cfg.allowedCnpjs.includes(cnpj)) throw Object.assign(new Error('CNPJ não autorizado neste Gateway'), {statusCode: 403});
}
function assertEnvironment(invoice, cfg) {
  const requested = invoice?.ambiente === 'producao' ? 'producao' : 'restrita';
  if (requested !== cfg.environment) throw Object.assign(new Error(`Ambiente divergente: navegador=${requested}, gateway=${cfg.environment}`), {statusCode: 409});
  if (cfg.environment === 'producao' && !cfg.allowProduction) throw Object.assign(new Error('Produção bloqueada no Gateway. Homologue antes e habilite ALLOW_PRODUCTION=true.'), {statusCode: 423});
}
function loadPfx(cfg, mod) {
  if (!certificateConfigured(cfg)) throw Object.assign(new Error('Certificado A1/PFX não configurado no Gateway'), {statusCode: 503});
  return mod.loadPfx(cfg.certificatePath, cfg.certificatePassword);
}

export function sefinBase(environment) {
  return environment === 'producao'
    ? 'https://sefin.nfse.gov.br/SefinNacional'
    : 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional';
}

function rawMtlsJson(cfg, method, relativePath) {
  return new Promise((resolve, reject) => {
    if (!certificateConfigured(cfg)) return reject(Object.assign(new Error('Certificado A1/PFX não configurado'), {statusCode: 503}));
    const base = new URL(sefinBase(cfg.environment));
    const pfx = fs.readFileSync(cfg.certificatePath);
    const req = https.request({
      hostname: base.hostname,
      port: 443,
      path: `${base.pathname.replace(/\/$/, '')}${relativePath}`,
      method,
      pfx,
      passphrase: cfg.certificatePassword,
      rejectUnauthorized: true,
      headers: {'Accept': 'application/json'},
      timeout: 30_000,
    }, incoming => {
      const chunks = [];
      incoming.on('data', c => chunks.push(c));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8'); let body = {};
        try { body = text ? JSON.parse(text) : {}; } catch { body = {raw: text}; }
        resolve({status: incoming.statusCode || 0, headers: incoming.headers, body});
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timeout SEFIN')));
    req.on('error', reject); req.end();
  });
}

async function validateInvoice(body, cfg) {
  const invoice = structuredClone(body?.invoice || {});
  assertEnvironment(invoice, cfg); checkCnpj(invoice, cfg);
  if (cfg.mock) return {ok: true, dpsId: `DPSMOCK${String(invoice?.emissao?.nDPS || '1').padStart(15, '0')}`, xmlPreview: '<DPS mock="true"/>'};
  const mod = await sdk();
  const built = mod.buildDpsFromJson(invoice);
  return {ok: true, dpsId: built.id, xmlPreview: built.xml};
}

async function issueInvoice(body, cfg) {
  const invoice = structuredClone(body?.invoice || {});
  assertEnvironment(invoice, cfg); checkCnpj(invoice, cfg);
  if (cfg.mock) {
    const n = String(invoice?.emissao?.nDPS || '1');
    const key = ('31' + '0'.repeat(46) + n).slice(-50).padStart(50, '3');
    const xml = `<NFSe><infNFSe><nNFSe>${n}</nNFSe></infNFSe></NFSe>`;
    const refs = persistXml(cfg, key, xml, {mock: true, environment: cfg.environment, fiscalDocumentId: body?.fiscalDocumentId || ''});
    return {ok: true, chaveAcesso: key, idDps: `DPSMOCK${n.padStart(15, '0')}`, number: n, processedAt: new Date().toISOString(), versaoAplicativo: 'mock', ...refs};
  }
  const mod = await sdk();
  const pfx = loadPfx(cfg, mod);
  const result = await mod.emitirNfse(invoice, pfx, {ambiente: cfg.environment});
  const xml = result?.nfseXml || '';
  const key = result?.chaveAcesso || '';
  if (!key || !xml) throw Object.assign(new Error('SEFIN não retornou chave/XML autorizado'), {statusCode: 502, body: result});
  const refs = persistXml(cfg, key, xml, {environment: cfg.environment, fiscalDocumentId: body?.fiscalDocumentId || '', commandId: body?.commandId || '', idDps: result?.idDps || ''});
  return {ok: true, chaveAcesso: key, idDps: result?.idDps || '', number: extractNumber(xml), processedAt: result?.dataHoraProcessamento || new Date().toISOString(), versaoAplicativo: result?.versaoAplicativo || '', ...refs};
}

async function queryNfse(key, cfg) {
  if (!/^\d{50}$/.test(key) && !cfg.mock) throw Object.assign(new Error('Chave de acesso deve possuir 50 dígitos'), {statusCode: 400});
  if (cfg.mock) return {ok: true, chaveAcesso: key, number: key.slice(-6), xmlRef: `gateway://storage/${safeName(key)}.xml`, environment: cfg.environment};
  const mod = await sdk(); const pfx = loadPfx(cfg, mod);
  const r = await mod.consultarNfse(key, pfx, cfg.environment);
  if (r.status !== 200) throw Object.assign(new Error('Consulta SEFIN falhou'), {statusCode: r.status || 502, body: r.body});
  let body = r.body || {}, xml = '';
  if (typeof body === 'string' && body.includes('<NFSe')) xml = body;
  if (!xml && body?.nfseXmlGZipB64 && typeof mod.gunzipBase64 === 'function') xml = mod.gunzipBase64(body.nfseXmlGZipB64);
  if (!xml && body?.xml) xml = body.xml;
  let refs = {};
  if (xml) refs = persistXml(cfg, key, xml, {environment: cfg.environment, query: true});
  return {ok: true, chaveAcesso: key, number: extractNumber(xml), ...refs, rawStatus: r.status};
}

async function reconcileDps(id, cfg) {
  const numeric = String(id || '').replace(/^DPS/i, '');
  if (!numeric) throw Object.assign(new Error('ID da DPS obrigatório'), {statusCode: 400});
  if (cfg.mock) return {ok: true, exists: false, dpsId: id, environment: cfg.environment};
  const r = await rawMtlsJson(cfg, 'GET', `/dps/${encodeURIComponent(numeric)}`);
  if (r.status === 404) return {ok: true, exists: false, dpsId: id};
  if (r.status < 200 || r.status >= 300) throw Object.assign(new Error('Consulta DPS falhou'), {statusCode: r.status || 502, body: r.body});
  const key = r.body?.chaveAcesso || r.body?.ChaveAcesso || '';
  return {ok: true, exists: !!key, chaveAcesso: key, dpsId: id, rawStatus: r.status};
}

export function createGateway(cfg = loadConfig()) {
  return http.createServer(async (req, res) => {
    const cors = corsHeaders(req, cfg);
    if (req.method === 'OPTIONS') return send(res, 204, {}, cors);
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname === '/api/v1/health' && req.method === 'GET') {
        let sdkReady = cfg.mock;
        if (!cfg.mock) { try { await sdk(); sdkReady = true; } catch {} }
        return send(res, 200, {ok: true, service: 'imperio-nfse-national-gateway', version: '1.0.0', environment: cfg.environment, productionAllowed: cfg.allowProduction, productionLocked: cfg.environment === 'producao' && !cfg.allowProduction, certificateConfigured: certificateConfigured(cfg), sdkReady, mock: cfg.mock}, cors);
      }
      if (!authorized(req, cfg)) return send(res, 401, {ok: false, error: 'unauthorized', message: 'Chave do Gateway inválida'}, cors);
      if (url.pathname === '/api/v1/validate' && req.method === 'POST') return send(res, 200, await validateInvoice(await readJson(req), cfg), cors);
      if (url.pathname === '/api/v1/nfse/issue' && req.method === 'POST') return send(res, 200, await issueInvoice(await readJson(req), cfg), cors);
      const q = /^\/api\/v1\/nfse\/([^/]+)$/.exec(url.pathname);
      if (q && req.method === 'GET') return send(res, 200, await queryNfse(decodeURIComponent(q[1]), cfg), cors);
      const d = /^\/api\/v1\/dps\/(.+)$/.exec(url.pathname);
      if (d && req.method === 'GET') return send(res, 200, await reconcileDps(decodeURIComponent(d[1]), cfg), cors);
      return send(res, 404, {ok: false, error: 'not_found'}, cors);
    } catch (error) {
      const status = Number(error?.statusCode || error?.status || 500);
      const body = {ok: false, error: status >= 500 ? 'gateway_error' : 'request_error', message: error?.message || String(error)};
      if (error?.body?.erros) body.rejections = error.body.erros;
      return send(res, status, body, cors);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const server = createGateway(cfg);
  server.listen(cfg.port, cfg.host, () => {
    console.log(`[Imperio Fiscal Gateway] http://${cfg.host}:${cfg.port} · ${cfg.environment} · cert=${certificateConfigured(cfg) ? 'ok' : 'ausente'} · produção=${cfg.allowProduction ? 'habilitada' : 'bloqueada'}`);
  });
}
