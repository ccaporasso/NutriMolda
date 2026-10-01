// Build reproduzível e CI (Gate, itens 17 e 18): a versão do Node está fixada em um lugar só, o projeto continua sem dependências,
// o workflow faz o que o roteiro pede, na ordem certa, sem segredo e sem nada que instale pacote; e o guia de reprodução cita comandos que existem.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
const pacote = JSON.parse(ler('package.json'));
const workflowCompleto = ler('.github', 'workflows', 'ci.yml');
const workflow = workflowCompleto.replace(/^\s*#.*$/gm, ''); // comentários não são passos
const guia = ler('docs', 'gate', 'REPRODUCAO.md');

test('versão do Node: .nvmrc tem uma versão exata, ela atende o mínimo do package.json e o guia a cita', () => {
  const nvmrc = ler('.nvmrc').trim();
  assert.match(nvmrc, /^\d+\.\d+\.\d+$/);
  const minimo = Number(/>=\s*(\d+)/.exec(pacote.engines.node)[1]);
  assert.ok(Number(nvmrc.split('.')[0]) >= minimo);
  assert.equal(minimo, require('../scripts/gate.js').MINIMO_NODE_MAJOR, 'o mínimo do package.json e o do gate precisam ser o mesmo');
  assert.ok(guia.includes(nvmrc), 'REPRODUCAO.md não cita a versão recomendada');
  assert.match(workflow, /node-version-file: \.nvmrc/);
  assert.doesNotMatch(workflow, /node-version: /, 'o CI não pode ter uma segunda versão escrita à mão');
});

test('o projeto não usa dependências e o package.json só dá nomes aos comandos', () => {
  for (const campo of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'workspaces']) assert.equal(pacote[campo], undefined, campo);
  assert.equal(pacote.private, true);
  assert.equal(fs.existsSync(path.join(raiz, 'package-lock.json')), false);
  assert.equal(fs.existsSync(path.join(raiz, 'node_modules')), false);
  for (const [nome, comando] of Object.entries(pacote.scripts)) {
    assert.doesNotMatch(comando, /npm (install|i|ci)\b|npx|yarn|pnpm|curl|wget|clasp/, `script ${nome} instala ou baixa algo`);
    const arquivo = /node (scripts\/[a-z-]+\.js)/.exec(comando);
    if (arquivo) assert.ok(fs.existsSync(path.join(raiz, arquivo[1])), `script ${nome} chama ${arquivo[1]}, que não existe`);
  }
  assert.ok(!Object.keys(pacote.scripts).some((n) => /^(pre|post)/.test(n)), 'sem ganchos pre/post: nada roda sozinho num npm run');
});

test('workflow: a cada pull request, Node fixo, testes, cobertura, git diff, produção, segurança e gate, nessa ordem', () => {
  assert.match(workflow, /^on:\n  pull_request:/m);
  const ordem = ['actions/checkout@', 'actions/setup-node@', 'run: node --test', 'scripts/cobertura.js --exigir', 'git diff --check', 'scripts/empacotar-producao.js', 'scripts/seguranca.js --historico', 'scripts/gate.js --estrito'];
  const posicoes = ordem.map((t) => workflow.indexOf(t));
  assert.ok(posicoes.every((p) => p >= 0), `falta no workflow: ${ordem.filter((t, i) => posicoes[i] < 0).join(', ')}`);
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes, 'passos fora da ordem do roteiro');
  assert.match(workflow, /fetch-depth: 0/, 'sem histórico completo a varredura do histórico e a comparação com a base não funcionam');
});

test('workflow: sem segredo, sem permissão de escrita, sem pull_request_target, sem instalar pacote e sem tocar no Google', () => {
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /npm (install|i|ci)\b|npx |yarn |pnpm |clasp|curl |wget /);
  assert.doesNotMatch(workflow, /contents: write|id-token|packages: write|pull-requests: write/);
  assert.match(workflow, /persist-credentials: false/);
  const usos = [...workflow.matchAll(/uses: ([^\s]+)/g)].map((m) => m[1]);
  assert.ok(usos.length >= 2 && usos.every((u) => /^actions\/(checkout|setup-node)@v\d+$/.test(u)), `ações fora das duas oficiais esperadas: ${usos.join(', ')}`);
});

test('guia de reprodução: todo script citado existe, o piso de cobertura citado é o do código e a proteção da main é só recomendação', () => {
  for (const m of guia.matchAll(/node (scripts\/[a-z-]+\.js)/g)) assert.ok(fs.existsSync(path.join(raiz, m[1])), `${m[1]} não existe`);
  const C = require('../scripts/cobertura.js');
  assert.match(guia, new RegExp(`${C.PISO_LINHAS}% de linhas, ${C.PISO_RAMOS}% de ramos ou ${C.PISO_FUNCOES}% de funções`));
  assert.match(guia, /Recomendação \(não aplicada\)/);
  assert.match(guia, /Gate local/);
  for (const nome of Object.keys(pacote.scripts)) if (['gate', 'gate:completo'].includes(nome)) assert.ok(guia.includes(nome.replace(':', ':')), `guia não cita npm run ${nome}`);
});

test('README aponta para a verificação reproduzível', () => {
  assert.match(ler('README.md'), /docs\/gate\/REPRODUCAO\.md/);
});
