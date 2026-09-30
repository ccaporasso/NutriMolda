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

// No Apps Script todos os arquivos de src/ dividem o mesmo escopo global: dois `const` ou
// `function` com o mesmo nome no nível de cima derrubam o projeto inteiro ao carregar.
test('nenhum nome global repetido entre os arquivos de src/', () => {
  const vistos = new Map();
  for (const arquivo of fs.readdirSync(path.join(raiz, 'src')).filter((a) => a.endsWith('.js'))) {
    const texto = fs.readFileSync(path.join(raiz, 'src', arquivo), 'utf8');
    for (const m of texto.matchAll(/^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      assert.ok(!vistos.has(m[1]), `"${m[1]}" aparece em ${vistos.get(m[1])} e em ${arquivo}`);
      vistos.set(m[1], arquivo);
    }
  }
});

test('funções do menu existem em algum arquivo de src/', () => {
  const todo = fs.readdirSync(path.join(raiz, 'src')).filter((a) => a.endsWith('.js'))
    .map((a) => fs.readFileSync(path.join(raiz, 'src', a), 'utf8')).join('\n');
  for (const m of todo.matchAll(/\.addItem\('[^']*',\s*'([A-Za-z_]\w*)'\)/g)) {
    assert.match(todo, new RegExp(`^function ${m[1]}\\(`, 'm'), `item de menu aponta para função inexistente: ${m[1]}`);
  }
});
