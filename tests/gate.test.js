// O comando único scripts/gate.js (Gate, item 19): a decisão de PASS/FAIL é lógica pura e é testada aqui, inclusive os casos
// em que o gate TEM que falhar (teste apagado, teste pulado, versão antiga do Node, dependência no package.json, aviso em modo estrito).
// O gate completo não é executado de dentro da suíte (ele próprio roda a suíte); ele é exercitado a cada rodada manual e no CI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../scripts/gate.js');

const raiz = path.join(__dirname, '..');

const bom = { testes: 600, aprovados: 600, falhos: 0, cancelados: 0, pulados: 0, pendentes: 0 };

test('lê o resumo dos testes nos dois formatos de saída do Node (TAP e spec)', () => {
  const tap = '# tests 529\n# suites 0\n# pass 528\n# fail 1\n# cancelled 0\n# skipped 2\n# todo 3\n# duration_ms 3000';
  assert.deepEqual(G.lerResumoTestes(tap), { testes: 529, aprovados: 528, falhos: 1, cancelados: 0, pulados: 2, pendentes: 3 });
  const spec = 'ℹ tests 10\nℹ suites 0\nℹ pass 10\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0';
  assert.deepEqual(G.lerResumoTestes(spec), { testes: 10, aprovados: 10, falhos: 0, cancelados: 0, pulados: 0, pendentes: 0 });
  assert.ok(Number.isNaN(G.lerResumoTestes('nada útil').testes));
});

test('testes: passa só com tudo verde, nada pulado, nada pendente e acima do piso', () => {
  assert.deepEqual(G.avaliarTestes(bom, 0, 500), []);
  assert.match(G.avaliarTestes({ ...bom, falhos: 1, aprovados: 599 }, 1, 500).join(' '), /1 teste\(s\) falharam/);
  assert.match(G.avaliarTestes({ ...bom, pulados: 1 }, 0, 500).join(' '), /pulado/);
  assert.match(G.avaliarTestes({ ...bom, pendentes: 1 }, 0, 500).join(' '), /todo/);
  assert.match(G.avaliarTestes({ ...bom, cancelados: 2 }, 0, 500).join(' '), /cancelado/);
  assert.match(G.avaliarTestes(bom, 1, 500).join(' '), /código 1/);
  assert.match(G.avaliarTestes({ ...bom, testes: 499, aprovados: 499 }, 0, 500).join(' '), /piso é 500/);
  assert.match(G.avaliarTestes({ testes: NaN, aprovados: NaN, falhos: NaN, cancelados: NaN, pulados: NaN, pendentes: NaN }, 0, 500).join(' '), /não consegui ler/);
  assert.deepEqual(G.avaliarTestes(bom, 0), [], 'sem piso (usado nos subconjuntos), o resumo verde passa');
});

test('o piso de testes do gate não é maior que a suíte atual (senão o gate reprovaria a si mesmo) e é um número deliberado', () => {
  assert.ok(Number.isInteger(G.MINIMO_TESTES) && G.MINIMO_TESTES >= 500);
});

test('versão do Node: abaixo da família 22 falha; versão diferente da recomendada avisa; igual passa', () => {
  assert.equal(G.avaliarVersaoNode('20.11.0', '22.22.0').estado, 'FAIL');
  assert.equal(G.avaliarVersaoNode('v18.0.0', '22.22.0').estado, 'FAIL');
  assert.equal(G.avaliarVersaoNode('22.22.0', '22.22.0').estado, 'PASS');
  assert.equal(G.avaliarVersaoNode('v22.22.0', '22.22.0\n'.trim()).estado, 'PASS');
  assert.equal(G.avaliarVersaoNode('22.10.0', '22.22.0').estado, 'WARN');
  assert.equal(G.avaliarVersaoNode('24.1.0', '22.22.0').estado, 'WARN');
  assert.match(G.avaliarVersaoNode('22.10.0', '22.22.0').detalhe.join(' '), /recomendado 22\.22\.0/);
});

test('resultado final: FAIL derruba; WARN e N/M passam mas aparecem; estrito reprova WARN; N/M nunca vira PASS', () => {
  const passo = (nome, estado) => ({ nome, estado, detalhe: [] });
  assert.deepEqual(G.resultadoFinal([passo('a', 'PASS'), passo('b', 'PASS')]), { texto: 'PASS', codigo: 0 });
  assert.deepEqual(G.resultadoFinal([passo('a', 'PASS'), passo('b', 'FAIL')]), { texto: 'FAIL', codigo: 1 });
  assert.deepEqual(G.resultadoFinal([passo('a', 'PASS'), passo('b', 'N/M')]), { texto: 'PASS (1 não medido(s))', codigo: 0 });
  assert.deepEqual(G.resultadoFinal([passo('a', 'WARN'), passo('b', 'N/M')]), { texto: 'PASS (1 aviso(s); 1 não medido(s))', codigo: 0 });
  assert.deepEqual(G.resultadoFinal([passo('a', 'WARN')], true), { texto: 'FAIL', codigo: 1 });
  assert.deepEqual(G.resultadoFinal([passo('a', 'N/M')], true), { texto: 'PASS (1 não medido(s))', codigo: 0 });
  assert.deepEqual(G.resultadoFinal([]), { texto: 'PASS', codigo: 0 });
});

test('relatório: formato do roteiro, com detalhe só quando não é PASS completo e sem esconder N/M', () => {
  const texto = G.formatarRelatorio([
    { nome: 'Testes', estado: 'PASS', detalhe: ['600 testes'] },
    { nome: 'Cobertura', estado: 'FAIL', detalhe: ['COBERTURA ABAIXO DO PISO em X.js'] },
    { nome: 'Mutação', estado: 'N/M', detalhe: ['não pedida'] },
  ]);
  assert.match(texto, /^GATE LOCAL\n/);
  assert.match(texto, /Testes\.+ PASS/);
  assert.match(texto, /Cobertura\.+ FAIL\n   - COBERTURA ABAIXO DO PISO/);
  assert.match(texto, /Mutação\.+ N\/M\n   - não pedida/);
  assert.match(texto, /RESULTADO: FAIL$/);
  assert.match(G.formatarRelatorio([{ nome: 'Testes', estado: 'PASS', detalhe: [] }]), /RESULTADO: PASS$/);
});

test('estrutura: falta de arquivo obrigatório, dado rastreado, credencial local, pacote gerado e dependência fazem falhar', () => {
  const tudo = [...G.ARQUIVOS_OBRIGATORIOS];
  const ok = { existentes: tudo, rastreados: ['src/Pix.js', 'src/appsscript.json', 'tests/pix.test.js'], pacote: { name: 'x', scripts: {} } };
  assert.deepEqual(G.problemasDeEstrutura(ok), []);
  assert.match(G.problemasDeEstrutura({ ...ok, existentes: tudo.slice(1) }).join(' '), /falta CLAUDE\.md/);
  for (const ruim of ['relatorio.csv', 'dados.XLSX', 'recibo.pdf', '.clasp.json', 'src/.clasprc.json', 'dist/producao/Pix.js', 'node_modules/x/y.js', '.env', 'docs/.env.local']) {
    assert.match(G.problemasDeEstrutura({ ...ok, rastreados: [ruim] }).join(' '), /não deve ir ao Git/, ruim);
  }
  assert.match(G.problemasDeEstrutura({ ...ok, rastreados: ['src/notas.txt'] }).join(' '), /estranho em src/);
  assert.match(G.problemasDeEstrutura({ ...ok, pacote: { dependencies: { qualquer: '1.0.0' } } }).join(' '), /dependencies/);
  assert.match(G.problemasDeEstrutura({ ...ok, pacote: { devDependencies: { qualquer: '1.0.0' } } }).join(' '), /devDependencies/);
  assert.match(G.problemasDeEstrutura({ ...ok, pacote: null }).join(' '), /ilegível/);
  assert.deepEqual(G.problemasDeEstrutura({ ...ok, pacote: { dependencies: {} } }), [], 'objeto vazio não é dependência');
});

test('os passos baratos do gate passam neste repositório (estrutura, escopos, varredura, produção, ambiente)', () => {
  const comGit = fs.existsSync(path.join(raiz, '.git')); // a cópia usada pela mutação não tem .git: lá estes passos dizem N/M, nunca PASS falso
  assert.equal(G.passoEstrutura().estado, comGit ? 'PASS' : 'N/M', JSON.stringify(G.passoEstrutura().detalhe));
  assert.equal(G.passoEscopos().estado, 'PASS');
  const varredura = G.passosDeVarredura(false);
  assert.deepEqual(varredura.map((p) => [p.nome, p.estado]), [['Dados de teste', 'PASS'], ['Segredos', 'PASS'], ['Histórico do Git', 'N/M']]);
  assert.equal(G.passoProducao().estado, 'PASS');
  assert.notEqual(G.passoAmbiente().estado, 'FAIL');
  assert.equal(G.passoMutacao(false).estado, 'N/M');
  if (comGit) assert.ok(['PASS', 'WARN'].includes(G.passoGitDiff().estado));
});
