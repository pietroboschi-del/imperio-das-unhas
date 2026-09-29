import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(here, 'baseline.json'), 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const runJson = (command, args, label) => {
  const run = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (run.error) throw new Error(`${label}: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`${label}: exit ${run.status}\n${run.stdout}\n${run.stderr}`);
  const lines = String(run.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let parsed = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try { parsed = JSON.parse(lines[i]); break; } catch {}
  }
  if (!parsed) throw new Error(`${label}: saída JSON final ausente\n${run.stdout}`);
  return parsed;
};

const failures = [];
const rows = [];
for (const suite of baseline.criticalSuites) {
  const abs = path.join(root, suite.path);
  if (!fs.existsSync(abs)) {
    failures.push(`${suite.key}: arquivo ausente (${suite.path})`);
    continue;
  }
  const fileHash = sha256(fs.readFileSync(abs));
  if (fileHash !== suite.testFileSha256) failures.push(`${suite.key}: teste de caracterização foi alterado`);
  try {
    const result = runJson(process.execPath, [suite.path], suite.key);
    const count = Number(result.assertions ?? result.tests ?? 0);
    const resultHash = sha256(canonical(result));
    if (result.ok !== true) failures.push(`${suite.key}: resultado ok != true`);
    if (count !== suite.assertions) failures.push(`${suite.key}: ${count} verificações; esperado ${suite.assertions}`);
    if (resultHash !== suite.resultSha256) failures.push(`${suite.key}: saída comportamental divergiu do golden master`);
    rows.push({ key: suite.key, assertions: count, ok: result.ok === true && count === suite.assertions && resultHash === suite.resultSha256 && fileHash === suite.testFileSha256 });
  } catch (err) {
    failures.push(String(err?.message || err));
    rows.push({ key: suite.key, assertions: 0, ok: false });
  }
}

const full = runJson(process.execPath, [baseline.fullRegression.path], 'full-regression');
for (const k of ['suites','passed','failed','assertions']) {
  if (Number(full[k]) !== Number(baseline.fullRegression[k])) failures.push(`full-regression: ${k}=${full[k]}; esperado ${baseline.fullRegression[k]}`);
}
if (full.ok !== true) failures.push('full-regression: ok != true');

for (const parity of baseline.backendParity || []) {
  try {
    const [cmd, ...args] = parity.command;
    const result = runJson(cmd, args, parity.key);
    if (result.ok !== true || Number(result.tests ?? 0) !== Number(parity.tests)) {
      failures.push(`${parity.key}: paridade divergiu`);
    }
    rows.push({ key: parity.key, assertions: Number(result.tests ?? 0), ok: result.ok === true && Number(result.tests ?? 0) === Number(parity.tests) });
  } catch (err) {
    failures.push(String(err?.message || err));
    rows.push({ key: parity.key, assertions: 0, ok: false });
  }
}

const criticalAssertions = rows.filter(r => !['decimal_money','professional_obligations_v97'].includes(r.key)).reduce((n,r)=>n+r.assertions,0);
const output = {
  ok: failures.length === 0,
  baselineVersion: baseline.baselineVersion,
  criticalSuites: baseline.criticalSuites.length,
  criticalAssertions,
  fullRegression: { suites: full.suites, passed: full.passed, failed: full.failed, assertions: full.assertions },
  backendParityTests: rows.filter(r => ['decimal_money','professional_obligations_v97'].includes(r.key)).reduce((n,r)=>n+r.assertions,0),
  rows,
  failures,
};
console.log(JSON.stringify(output));
if (failures.length) process.exit(1);
