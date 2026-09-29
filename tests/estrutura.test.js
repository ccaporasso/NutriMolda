// Confere a estrutura mínima exigida na T00.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const manifesto = JSON.parse(
  fs.readFileSync(path.join(raiz, 'src', 'appsscript.json'), 'utf8')
);

test('fuso horário é America/Sao_Paulo', () => {
  assert.equal(manifesto.timeZone, 'America/Sao_Paulo');
});

test('usa o motor V8', () => {
  assert.equal(manifesto.runtimeVersion, 'V8');
});

test('escopos declarados explicitamente e justificados em DECISOES.md', () => {
  assert.ok(Array.isArray(manifesto.oauthScopes));
  const decisoes = fs.readFileSync(path.join(raiz, 'docs', 'DECISOES.md'), 'utf8');
  for (const escopo of manifesto.oauthScopes) {
    const nome = escopo.split('/').pop();
    assert.ok(decisoes.includes(nome), `escopo sem justificativa: ${nome}`);
  }
});

test('.clasp.json fica fora do Git e envia só a pasta src', () => {
  const ignorados = fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8');
  assert.match(ignorados, /^\.clasp\.json$/m);
  const exemplo = JSON.parse(
    fs.readFileSync(path.join(raiz, '.clasp.json.exemplo'), 'utf8')
  );
  assert.equal(exemplo.rootDir, 'src');
});

test('código do Apps Script também carrega no Node', () => {
  const { VERSAO_KIT } = require(path.join(raiz, 'src', 'Principal.js'));
  assert.match(VERSAO_KIT, /^\d+\.\d+\.\d+$/);
});
