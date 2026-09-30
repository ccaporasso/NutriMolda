// Fase 2b (esqueleto de T20 a T24): as decisões pendentes precisam estar marcadas e listadas, e nada é instalado ainda.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const pendencias = fs.readFileSync(path.join(raiz, 'docs', 'PENDENCIAS-FASE-2B.md'), 'utf8');
const ARQUIVOS_2B = ['Respostas.js', 'Presenca.js', 'FilaAjustes.js', 'Frases.js', 'Modos.js'].filter((a) => fs.existsSync(path.join(raiz, 'src', a)));
const codigo = ARQUIVOS_2B.map((a) => fs.readFileSync(path.join(raiz, 'src', a), 'utf8')).join('\n');

test('toda marca PENDENTE Pn no código tem linha na lista de pendências', () => {
  const marcas = new Set([...codigo.matchAll(/PENDENTE (P\d+)/g)].map((m) => m[1]));
  assert.ok(marcas.size > 0);
  for (const p of marcas) assert.match(pendencias, new RegExp(`^\\| ${p} \\|`, 'm'), `${p} não está em PENDENCIAS-FASE-2B.md`);
});

test('toda pendência aberta da lista aparece marcada no código', () => {
  for (const m of pendencias.matchAll(/^\| (P\d+) \|/gm)) assert.match(codigo, new RegExp(`PENDENTE ${m[1]}\\b`), `${m[1]} não está marcada no código`);
});

test('o esqueleto não chama o Google nem cria formulário, aba, gatilho ou menu', () => {
  assert.doesNotMatch(codigo, /SpreadsheetApp|FormApp|ScriptApp|MailApp|DriveApp|UrlFetchApp|Calendar\./);
  assert.doesNotMatch(codigo, /\.addItem\(|insertSheet|newTrigger/);
});
