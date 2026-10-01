// A ferramenta de cobertura (scripts/cobertura.js) também é código: lê o lcov, soma, aponta módulo crítico sem medição e gera a tabela.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../scripts/cobertura.js');

const LCOV = [
  'SF:/x/src/Pix.js', 'FN:1,a', 'FN:5,b', 'FNDA:3,a', 'FNDA:0,b', 'DA:1,3', 'DA:2,3', 'DA:5,0', 'BRDA:2,0,0,1', 'BRDA:2,0,1,-', 'BRDA:2,0,2,0', 'end_of_record',
  'SF:/x/src/Frases.js', 'FNDA:1,f', 'DA:1,1', 'end_of_record',
].join('\n');

test('lerLcov e medir: linhas, ramos e funções por módulo, com as linhas e ramos que faltam', () => {
  const modulos = C.lerLcov(LCOV);
  assert.deepEqual(Object.keys(modulos), ['Pix.js', 'Frases.js']);
  const m = C.medir(modulos['Pix.js']);
  assert.equal(Math.round(m.linhas), 67); // 2 de 3
  assert.equal(Math.round(m.ramos), 33); // 1 de 3
  assert.equal(Math.round(m.funcoes), 50); // 1 de 2
  assert.deepEqual(m.linhasNaoExecutadas, [5]);
  assert.deepEqual(m.ramosNaoTomados, [2]);
  assert.deepEqual(m.funcoesNaoExecutadas, ['b']);
  const f = C.medir(modulos['Frases.js']);
  assert.equal(f.ramos, 100, 'sem ramos conta como 100%');
});

test('resumo, total e tabela em Markdown', () => {
  const r = C.resumirTudo(C.lerLcov(LCOV));
  assert.equal(r.modulos.find((m) => m.arquivo === 'Pix.js').criticidade, 'crítica');
  assert.equal(r.modulos.find((m) => m.arquivo === 'Frases.js').criticidade, 'normal');
  assert.deepEqual(r.total.n.linhas, [3, 4]);
  const tabela = C.tabelaMarkdown(r);
  assert.match(tabela, /^\| Módulo \| Linhas/);
  assert.match(tabela, /\| Pix\.js \| 66\.7% \(2\/3\)/);
  assert.match(tabela, /\*\*Total src\/\*\*/);
});

test('módulo crítico ausente da medição é apontado (um arquivo que deixa de ser contado não passa batido)', () => {
  const r = C.resumirTudo(C.lerLcov(LCOV));
  const faltam = C.criticosSemMedicao(r);
  assert.ok(faltam.includes('GeradorRecibo.js') && faltam.includes('Acoes.js'));
  assert.ok(!faltam.includes('Pix.js'));
  const completo = { modulos: C.CRITICOS.map((arquivo) => ({ arquivo })) };
  assert.deepEqual(C.criticosSemMedicao(completo), []);
});

test('os pisos de cobertura são números deliberados e a lista de módulos críticos não tem repetidos', () => {
  assert.ok(C.PISO_LINHAS >= 95 && C.PISO_RAMOS >= 90 && C.PISO_FUNCOES >= 95);
  assert.equal(new Set(C.CRITICOS).size, C.CRITICOS.length);
});

test('--escrever troca só a tabela: o texto escrito à mão antes e depois dela é preservado', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-cob-'));
  const arquivo = path.join(pasta, 'C.md');
  fs.writeFileSync(arquivo, '# Título\n\nTexto antes.\n\n| Módulo | Linhas |\n|---|---|\n| Velho.js | 1% |\n\n## Depois\n\nTexto depois.\n');
  C.escreverTabela(arquivo, '| Módulo | Linhas |\n|---|---|\n| Novo.js | 100% |');
  const texto = fs.readFileSync(arquivo, 'utf8');
  assert.match(texto, /Texto antes\./);
  assert.match(texto, /## Depois\n\nTexto depois\./);
  assert.match(texto, /Novo\.js/);
  assert.doesNotMatch(texto, /Velho\.js/);
  const semTabela = path.join(pasta, 'D.md');
  fs.writeFileSync(semTabela, '# Só texto\n');
  C.escreverTabela(semTabela, '| Módulo | Linhas |\n|---|---|');
  assert.match(fs.readFileSync(semTabela, 'utf8'), /# Só texto\n\n\| Módulo \|/);
  fs.rmSync(pasta, { recursive: true, force: true });
});
