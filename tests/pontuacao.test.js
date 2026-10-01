// A conta da régua do Gate v1.0 (scripts/pontuacao.js) e as entradas dela (docs/gate/CRITERIOS.md): a régua não muda, todo teste citado
// existe, eliminatório SIM derruba qualquer nota e a REAUDITORIA cita exatamente os números que o script calcula.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../scripts/pontuacao.js');

const raiz = path.join(__dirname, '..');
const criterios = fs.readFileSync(path.join(raiz, 'docs', 'gate', 'CRITERIOS.md'), 'utf8');

test('a régua é a do Gate v1.0: pesos que somam 100, limiares e faixas finais exatamente como escritos pelo revisor', () => {
  const pesos = Object.fromEntries(Object.entries(P.REGUA).map(([k, v]) => [k, v.peso]));
  assert.deepEqual(pesos, { correcao: 25, testabilidade: 20, arquitetura: 15, integridade: 15, seguranca: 15, eficiencia: 5, disciplina: 5 });
  assert.equal(Object.values(pesos).reduce((a, b) => a + b, 0), 100);
  const limiares = Object.fromEntries(Object.entries(P.REGUA).filter(([, v]) => v.aprova).map(([k, v]) => [k, [v.aprova, v.alerta]]));
  assert.deepEqual(limiares, { correcao: [95, 85], testabilidade: [90, 75], arquitetura: [80, 65], integridade: [90, 75], disciplina: [80, 60] });
  assert.deepEqual(P.FAIXAS, [[85, 'PASSA'], [70, 'PASSA COM RESSALVAS'], [55, 'NÃO PASSA']]);
});

test('faixas finais e zonas: o limite pertence à faixa de cima, sem arredondar para atravessar', () => {
  assert.equal(P.classificar(100), 'PASSA');
  assert.equal(P.classificar(85), 'PASSA');
  assert.equal(P.classificar(84.99), 'PASSA COM RESSALVAS');
  assert.equal(P.classificar(70), 'PASSA COM RESSALVAS');
  assert.equal(P.classificar(69.99), 'NÃO PASSA');
  assert.equal(P.classificar(55), 'NÃO PASSA');
  assert.equal(P.classificar(54.99), 'REPROVA ESTRUTURALMENTE');
  const c = P.REGUA.correcao;
  assert.equal(P.zonaNumerica(95, c), 'APROVA');
  assert.equal(P.zonaNumerica(94.99, c), 'ALERTA');
  assert.equal(P.zonaNumerica(85, c), 'ALERTA');
  assert.equal(P.zonaNumerica(84.99, c), 'REPROVA');
});

test('leitura das tabelas e contas de cada dimensão com dados pequenos', () => {
  const texto = [
    '| F01 | a | `tests/x.test.js` | sim | sim | não | sim |', // vale nas duas bases
    '| F02 | b | `tests/x.test.js` | sim | sim | sim | sim |', // caminho do Google mudou: só E2
    '| F03 | c | `tests/x.test.js` | não | não | não | sim |', // lógica pura: vale nas duas
    '| F04 | d | sem teste | sim | não | não | não |', // não atendido
  ].join('\n');
  const c = P.pontuarCorrecao(P.lerTabela(texto, 'F'));
  assert.deepEqual([c.total, c.e2, c.conservadora], [4, 3, 2]);
  const i = P.pontuarIntegridade(P.lerTabela([
    '| I01 | op | `tests/a.test.js` | `tests/a.test.js` | `tests/a.test.js` | `tests/a.test.js` | concorrência |',
    '| I02 | op | `tests/a.test.js` | n/a | n/a | n/a | |',
  ].join('\n'), 'I'));
  assert.deepEqual([i.total, i.e2, i.conservadora], [5, 5, 4], 'n/a não conta como cenário; "não observado" sai só da base conservadora');
  const a = P.pontuarArquitetura(P.lerTabela('| A01 | x | 20 | 15 | e |\n| A02 | y | 20 | 10 | e |', 'A'));
  assert.equal(a.pctE2, 62.5);
  assert.equal(P.pontuarDisciplina(P.lerTabela('| D01 | x | sim |\n| D02 | y | não |', 'D')).pctE2, 50);
  assert.equal(P.pontuarTestabilidade(P.lerTabela('| T01 | f | `tests/a.test.js` | `tests/a.test.js` | n/a | n/a |\n| T02 | g | `tests/a.test.js` | | n/a | n/a |', 'T')).pctE2, 50, 'célula vazia deixa o fluxo sem cobertura');
});

test('um eliminatório SIM derruba o resultado qualquer que seja a nota', () => {
  const r = P.calcular(criterios.replace(/(\| E03 \| [^|]+\| )NÃO/, '$1SIM'));
  assert.equal(r.bases.e2.resultado, 'NÃO PASSA (eliminatório)');
  assert.equal(r.bases.conservadora.resultado, 'NÃO PASSA (eliminatório)');
  assert.ok(r.bases.e2.nota > 85, 'a nota continua sendo mostrada; o eliminatório é que decide');
});

test('CRITERIOS.md: sete eliminatórios respondidos, todo teste citado existe e tem testes, ids em sequência', () => {
  const r = P.calcular(criterios);
  assert.equal(r.eliminatorios.length, 7);
  for (const e of r.eliminatorios) assert.match(e.resposta, /^(SIM|NÃO)$/, e.id);
  const citados = new Set([...criterios.matchAll(/`(tests\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]));
  assert.ok(citados.size >= 20);
  for (const t of citados) {
    const arquivo = path.join(raiz, t);
    assert.ok(fs.existsSync(arquivo), `CRITERIOS.md cita ${t}, que não existe`);
    assert.match(fs.readFileSync(arquivo, 'utf8'), /^test\(/m, `${t} não tem nenhum teste`);
  }
  for (const prefixo of ['F', 'T', 'A', 'I', 'D']) {
    const ids = P.lerTabela(criterios, prefixo).map((l) => l[0]);
    assert.ok(ids.length >= 5, prefixo);
    assert.deepEqual(ids, ids.map((_, i) => `${prefixo}${String(i + 1).padStart(2, '0')}`), `ids de ${prefixo} fora de sequência`);
  }
  // os dois achados abertos entram como critérios NÃO atendidos (a lista não é só do que passa)
  const naoAtendidos = P.lerTabela(criterios, 'F').filter((l) => l[6] !== 'sim').map((l) => l[0]);
  assert.deepEqual(naoAtendidos, ['F40', 'F41']);
});

test('REAUDITORIA.md cita exatamente as notas que o script calcula (os números do documento não derivam)', () => {
  const doc = fs.readFileSync(path.join(raiz, 'docs', 'gate', 'REAUDITORIA.md'), 'utf8');
  const r = P.calcular(criterios);
  const f = (n) => n.toFixed(1).replace('.', ',');
  for (const base of ['e2', 'conservadora']) {
    const b = r.bases[base];
    assert.ok(doc.includes(`nota final ${base === 'e2' ? 'E2' : 'conservadora'}: ${f(b.nota)} (${b.resultado})`), `REAUDITORIA.md precisa dizer: nota final ${base}: ${f(b.nota)} (${b.resultado})`);
    for (const d of Object.values(b.dimensoes)) assert.ok(doc.includes(f(d.nota)), `REAUDITORIA.md não cita a nota ${f(d.nota)} de ${d.nome}`);
  }
});
