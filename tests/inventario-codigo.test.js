// Inventário do código (Gate, itens 34 e 35): cada arquivo de src/ tem uma classificação explícita e o que é esqueleto não vira
// funcionalidade por acidente. Classificação: PRODUÇÃO, EXPERIMENTAL, ESQUELETO ou TESTE (docs/gate/INVENTARIO-CODIGO.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../scripts/empacotar-producao.js');
const C = require('../scripts/complexidade.js');

const raiz = path.join(__dirname, '..');
const arquivosSrc = fs.readdirSync(path.join(raiz, 'src')).filter((a) => a.endsWith('.js')).sort();
const ler = (a) => fs.readFileSync(path.join(raiz, 'src', a), 'utf8');
const semComentarios = (t) => t.replace(/^\s*\/\/.*$/gm, '');

// Experimental: nada hoje. Se um arquivo entrar aqui, o inventário em docs/gate precisa dizer por quê.
const EXPERIMENTAIS = [];
const CLASSIFICACAO = Object.fromEntries(arquivosSrc.map((a) => [a,
  E.ARQUIVOS_SOMENTE_TESTE.includes(a) ? 'TESTE' : E.ARQUIVOS_ESQUELETO.includes(a) ? 'ESQUELETO' : EXPERIMENTAIS.includes(a) ? 'EXPERIMENTAL' : 'PRODUÇÃO']));

test('todo arquivo de src/ tem classificação e as listas do empacotador só citam arquivos que existem', () => {
  for (const a of [...E.ARQUIVOS_SOMENTE_TESTE, ...E.ARQUIVOS_ESQUELETO]) assert.ok(arquivosSrc.includes(a), `${a} está numa lista mas não existe em src/`);
  const repetidos = E.ARQUIVOS_SOMENTE_TESTE.filter((a) => E.ARQUIVOS_ESQUELETO.includes(a));
  assert.deepEqual(repetidos, [], 'arquivo classificado como teste e esqueleto ao mesmo tempo');
  assert.equal(Object.keys(CLASSIFICACAO).length, arquivosSrc.length);
});

test('o documento de inventário lista cada arquivo de src/ com a mesma classificação do código', () => {
  const doc = fs.readFileSync(path.join(raiz, 'docs', 'gate', 'INVENTARIO-CODIGO.md'), 'utf8');
  for (const [arquivo, classe] of Object.entries(CLASSIFICACAO)) {
    assert.match(doc, new RegExp(`^\\| \`${arquivo.replace('.', '\\.')}\` \\| ${classe} \\|`, 'm'), `INVENTARIO-CODIGO.md não traz ${arquivo} como ${classe}`);
  }
});

test('esqueleto se declara esqueleto na primeira linha, e só os esqueletos fazem isso', () => {
  for (const a of arquivosSrc) {
    const primeira = ler(a).split('\n')[0];
    assert.equal(/\(ESQUELETO\)/.test(primeira), CLASSIFICACAO[a] === 'ESQUELETO', `${a}: marca (ESQUELETO) na primeira linha não bate com a classificação ${CLASSIFICACAO[a]}`);
  }
});

test('esqueleto não tem ponto de entrada: nenhum menu, gatilho, aba ou chamada ao Google', () => {
  for (const a of E.ARQUIVOS_ESQUELETO) {
    const codigo = semComentarios(ler(a));
    assert.doesNotMatch(codigo, /\b(SpreadsheetApp|Calendar\.|Drive\.|DocumentApp|MailApp|ScriptApp|LockService|UrlFetchApp|HtmlService)\b/, `${a} chama o Google`);
    assert.doesNotMatch(codigo, /\b(onOpen|onEdit|doGet|doPost)\b|\.addItem\(|\.newTrigger\(/, `${a} tem ponto de entrada`);
    assert.doesNotMatch(codigo, /\bregistrar(Erro|Alerta)?\(/, `${a} escreve no Registro`);
  }
});

test('nenhum arquivo fora dos esqueletos usa o que um esqueleto define (a produção não depende deles)', () => {
  const nomes = E.ARQUIVOS_ESQUELETO.flatMap((a) => E.nomesGlobais(ler(a)));
  assert.ok(nomes.length >= 20, 'poucos nomes de esqueleto descobertos');
  for (const a of arquivosSrc.filter((x) => !E.ARQUIVOS_ESQUELETO.includes(x))) {
    const codigo = semComentarios(ler(a));
    for (const n of nomes) assert.doesNotMatch(codigo, new RegExp(`(?<![\\w$])${n.replace(/\$/g, '\\$')}(?![\\w$])`), `${a} usa "${n}", definido em um esqueleto`);
  }
});

test('o pacote de produção não leva esqueleto nem arquivo de teste, e levaria se a lista fosse esvaziada (a verificação funciona)', () => {
  const pacote = E.montarPacoteProducao();
  const nomes = pacote.arquivos.map((a) => a.nome);
  for (const a of [...E.ARQUIVOS_SOMENTE_TESTE, ...E.ARQUIVOS_ESQUELETO]) assert.ok(!nomes.includes(a), `${a} está no pacote de produção`);
  // um pacote com um esqueleto dentro é recusado
  const comEsqueleto = { ...pacote, arquivos: [...pacote.arquivos, { nome: 'Modos.js', conteudo: ler('Modos.js') }] };
  assert.ok(E.verificarPacoteProducao(comEsqueleto).some((p) => /esqueleto Modos\.js/.test(p)));
});

test('pendências PENDENTE Pn: todo arquivo de esqueleto com marca está na lista da fase 2b (e nenhum arquivo de produção tem marca)', () => {
  const lista = fs.readFileSync(path.join(raiz, 'docs', 'PENDENCIAS-FASE-2B.md'), 'utf8');
  for (const a of arquivosSrc) {
    const marcas = [...ler(a).matchAll(/PENDENTE (P\d+)/g)].map((m) => m[1]);
    if (CLASSIFICACAO[a] !== 'ESQUELETO') assert.deepEqual(marcas, [], `${a} tem PENDENTE mas não é esqueleto`);
    for (const m of marcas) assert.match(lista, new RegExp(`\\b${m}\\b`), `${m} (${a}) não está em PENDENCIAS-FASE-2B.md`);
  }
});

// Complexidade (item 34): a medição por texto precisa achar função e responsabilidade onde elas existem.
test('complexidade: acha funções, mede linhas e reconhece responsabilidades', () => {
  const texto = [
    '// comentário', 'function pequena(a) {', '  return a + 1;', '}', '',
    'function mista(ui) {', '  const x = planejarAlgo(1);', '  ui.alert(x);', '  SpreadsheetApp.flush();', '  gravarLinha(1);', '  registrar(\'m\', \'info\', \'t\');',
    ...Array.from({ length: 22 }, (_, i) => `  const v${i} = ${i};`), '}', '', 'function umaLinha() { return 1; }',
  ].join('\n');
  const fs_ = C.funcoesDoArquivo('X.js', texto).map(C.classificar);
  assert.deepEqual(fs_.map((f) => f.nome), ['pequena', 'mista', 'umaLinha']);
  assert.equal(fs_[0].linhas, 3);
  assert.deepEqual(fs_[0].tags, []);
  assert.equal(fs_[2].linhas, 1);
  assert.deepEqual([...fs_[1].tags].sort(), ['google', 'interface', 'planilha', 'registro', 'regra']);
  assert.equal(C.candidata(fs_[1]), true);
  assert.equal(C.candidata(fs_[0]), false);
});

test('complexidade: o relatório do projeto mede todas as funções de src/ e o documento cita as candidatas atuais', () => {
  const funcoes = C.medir();
  assert.ok(funcoes.length >= 200);
  const doc = fs.readFileSync(path.join(raiz, 'docs', 'gate', 'COMPLEXIDADE.md'), 'utf8');
  for (const f of funcoes.filter(C.candidata)) assert.ok(doc.includes(`\`${f.nome}\``), `COMPLEXIDADE.md não analisa a função candidata ${f.nome}`);
});
