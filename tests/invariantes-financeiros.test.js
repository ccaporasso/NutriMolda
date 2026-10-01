// Gate B/C: invariantes de pagamentos, pacotes e relatório, com limites sistemáticos e conjuntos gerados de forma determinística
// (sem biblioteca externa). Só dados inventados. Itens 25, 29, 30 e 31 do roteiro.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/Acoes.js');
const P = require('../src/Pagamentos.js');
const R = require('../src/Relatorio.js');
const F = require('../src/Formatos.js');
const { criarConsultorio } = require('./apoio/fluxo.js');

// Gerador congruencial: mesma sequência em toda máquina.
function gerador(semente) {
  let s = semente >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const escolhe = (rnd, lista) => lista[Math.floor(rnd() * lista.length)];

const pg = (extra = {}) => ({ linha: 2, id: 'PG000001', id_evento: 'e1', codigo_paciente: 'P9001', pagador_nome: '', pagador_cpf: '', valor_centavos: 15000, forma: '', status: 'a_receber', data_pagamento: '', link_recibo: '', pacote_inicio: '', ...extra });
const pacote = (extra = {}) => ({ linha: 2, codigo_paciente: 'P9001', total_consultas: 4, usadas: 0, valor_centavos: 60000, inicio: '2026-09-01', ...extra });
const HOJE = '2026-09-30';

// ---------- pagamentos ----------

test('um pagamento que saiu de a_receber nunca volta nem é pago de novo por nenhuma ação (estado final)', () => {
  for (const status of ['pago', 'cortesia']) {
    const p = pg({ status, forma: status === 'pago' ? 'pix' : 'cortesia' });
    for (const forma of ['pix', 'cartao', 'dinheiro']) assert.equal(A.aplicarPagamentoRecebido(p, forma, HOJE).ok, false, `${status}->${forma}`);
    assert.equal(A.aplicarCortesia(p).ok, false);
    assert.equal(A.aplicarPacote(p, [pacote()], HOJE).ok, false);
  }
});

test('repetir a mesma ação sobre o resultado dela é recusado (pagar duas vezes, cortesia duas vezes, pacote duas vezes)', () => {
  const pago = A.aplicarPagamentoRecebido(pg(), 'pix', HOJE).pagamento;
  assert.equal(A.aplicarPagamentoRecebido(pago, 'pix', HOJE).ok, false);
  const cortesia = A.aplicarCortesia(pg()).pagamento;
  assert.equal(A.aplicarCortesia(cortesia).ok, false);
  const viaPacote = A.aplicarPacote(pg(), [pacote()], HOJE).pagamento;
  assert.equal(A.aplicarPacote(viaPacote, [pacote({ usadas: 1 })], HOJE).ok, false);
});

test('cortesia tem valor zero e forma cortesia; pacote tem valor zero e forma pacote (sem receita unitária fictícia)', () => {
  const c = A.aplicarCortesia(pg()).pagamento;
  assert.deepEqual([c.valor_centavos, c.forma, c.status], [0, 'cortesia', 'cortesia']);
  const k = A.aplicarPacote(pg(), [pacote()], HOJE).pagamento;
  assert.deepEqual([k.valor_centavos, k.forma, k.status], [0, 'pacote', 'pago']);
  const rel = R.consolidarRecebimentos([{ ...k, data_pagamento: HOJE }, { ...c }], '2026-09');
  assert.equal(rel.totalCentavos, 0);
  assert.equal(rel.quantidade, 0);
});

const VALORES_INVALIDOS = [0, -1, -15000, NaN, Infinity, -Infinity, '15000', '150.5', '', null, undefined, 1.5, 0.1, Number.MAX_SAFE_INTEGER + 1, {}, [], true];
test('valor inválido (0, negativo, NaN, Infinity, texto, nulo, fracionário, acima do inteiro seguro) nunca é marcado como pago', () => {
  for (const v of VALORES_INVALIDOS) {
    assert.equal(A.aplicarPagamentoRecebido(pg({ valor_centavos: v }), 'pix', HOJE).ok, false, String(v));
  }
});
test('valor válido nos limites: 1 centavo e o maior inteiro seguro são aceitos como dinheiro recebido', () => {
  for (const v of [1, 100, 15000, Number.MAX_SAFE_INTEGER]) assert.equal(A.aplicarPagamentoRecebido(pg({ valor_centavos: v }), 'pix', HOJE).ok, true, String(v));
});

test('forma inválida nunca marca pago', () => {
  for (const forma of ['', 'boleto', 'PIX', null, undefined, 'pacote', 'cortesia', 5]) assert.equal(A.aplicarPagamentoRecebido(pg(), forma, HOJE).ok, false, String(forma));
});

test('ids de pagamento são únicos, crescentes e não reaproveitados por lacunas; id fora do padrão não derruba a numeração', () => {
  assert.equal(P.proximoNumeroPagamento([]), 1);
  assert.equal(P.proximoNumeroPagamento([{ id: 'PG000003' }, { id: 'PG000010' }, { id: 'lixo' }, { id: '' }, {}]), 11);
  // a ordem das linhas não pode importar: o maior id manda, mesmo que a linha dele não seja a última (mutação M21)
  assert.equal(P.proximoNumeroPagamento([{ id: 'PG000010' }, { id: 'PG000003' }]), 11);
  assert.equal(P.proximoNumeroPagamento([{ id: 'PG000007' }, { id: 'PG000002' }, { id: 'PG000005' }]), 8);
  const consultas = Array.from({ length: 50 }, (_, i) => ({ id_evento: `e${i}`, data: '2026-09-10', hora: `${String(8 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`, tipo: 'retorno', codigo_paciente: `P90${i % 7}`, status: 'marcada', linha: i + 2 }));
  const plano = P.planejarAReceber({ consultas, pagamentos: [{ id: 'PG000007', id_evento: 'antigo', status: 'pago' }], config: { valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000 } });
  const ids = plano.novos.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id > 'PG000007'));
  assert.equal(new Set(plano.novos.map((n) => n.id_evento)).size, plano.novos.length);
});

test('ids de evento repetidos nas consultas geram uma cobrança só', () => {
  const c = (extra) => ({ id_evento: 'e1', data: '2026-09-10', hora: '09:00', tipo: 'retorno', codigo_paciente: 'P9001', status: 'marcada', linha: 2, ...extra });
  const plano = P.planejarAReceber({ consultas: [c({}), c({ linha: 3 })], pagamentos: [], config: { valor_retorno_centavos: 10000 } });
  assert.equal(plano.novos.length, 1);
  assert.equal(plano.contagens.idRepetido, 1);
});

// ---------- pacotes ----------

test('limites de pacote: total 0, negativo, NaN, Infinity, texto, fracionário e usadas > total nunca consomem consulta', () => {
  for (const total of [0, -1, NaN, Infinity, '4', 1.5, null, undefined]) {
    assert.equal(A.aplicarPacote(pg(), [pacote({ total_consultas: total })], HOJE).ok, false, `total ${total}`);
  }
  for (const usadas of [-1, NaN, '1', 0.5, null, undefined, 5]) {
    assert.equal(A.aplicarPacote(pg(), [pacote({ total_consultas: 4, usadas })], HOJE).ok, false, `usadas ${usadas}`);
  }
  assert.equal(A.aplicarPacote(pg(), [pacote({ total_consultas: 1, usadas: 0 })], HOJE).ok, true);
  assert.equal(A.aplicarPacote(pg(), [pacote({ total_consultas: 1, usadas: 1 })], HOJE).ok, false, 'esgotado');
});

test('datas de pacote: início futuro, inválido, vazio e bissexto', () => {
  assert.equal(A.aplicarPacote(pg(), [pacote({ inicio: '2026-10-01' })], HOJE).ok, false, 'futuro');
  for (const inicio of ['', '2026-02-30', '2027-02-29', '30/09/2026', 'x', undefined]) assert.equal(A.aplicarPacote(pg(), [pacote({ inicio })], HOJE).ok, false, String(inicio));
  assert.equal(A.aplicarPacote(pg(), [pacote({ inicio: '2024-02-29' })], '2026-09-30').ok, true, 'bissexto real');
  assert.equal(A.aplicarPacote(pg(), [pacote({ inicio: HOJE })], HOJE).ok, true, 'começa hoje (datas iguais)');
});

test('propriedade: 0 <= usadas <= total depois de qualquer sequência de consumos e reconciliações (800 cenários gerados)', () => {
  const rnd = gerador(20261001);
  for (let n = 0; n < 800; n++) {
    const total = Math.floor(rnd() * 6); // 0..5
    const usadasIniciais = Math.floor(rnd() * (total + 1));
    let pacotes = [pacote({ total_consultas: total, usadas: usadasIniciais })];
    const pagamentos = [];
    const tentativas = Math.floor(rnd() * 9);
    for (let i = 0; i < tentativas; i++) {
      const acao = rnd();
      if (acao < 0.7) {
        const r = A.aplicarPacote(pg({ id: `PG${n}_${i}` }), pacotes, HOJE);
        if (r.ok) { pagamentos.push(r.pagamento); pacotes = [r.pacote]; }
      } else { // simula "o pagamento foi gravado e a coluna usadas não": reconciliação precisa consertar
        const r = A.aplicarPacote(pg({ id: `PG${n}_${i}` }), pacotes, HOJE);
        if (r.ok) pagamentos.push(r.pagamento);
      }
      const rec = A.reconciliarPacotes(pacotes, pagamentos);
      for (const novo of rec.pacotes) {
        assert.ok(novo.usadas >= 0 && novo.usadas <= novo.total_consultas, `fora da faixa no cenário ${n}: ${novo.usadas}/${novo.total_consultas}`);
      }
      pacotes = rec.pacotes;
    }
  }
});

test('a reconciliação nunca diminui consumo (legítimo ou digitado) e não toca em pacote ambíguo, sem início ou de total inválido', () => {
  const pagos = (n, inicio = '2026-09-01') => Array.from({ length: n }, (_, i) => ({ id: `PG${i}`, codigo_paciente: 'P9001', status: 'pago', forma: 'pacote', pacote_inicio: inicio }));
  assert.equal(A.reconciliarPacotes([pacote({ usadas: 3 })], pagos(1)).pacotes[0].usadas, 3, 'não diminui');
  assert.equal(A.reconciliarPacotes([pacote({ usadas: 1 })], pagos(3)).pacotes[0].usadas, 3, 'sobe até o pago');
  assert.equal(A.reconciliarPacotes([pacote({ usadas: 0 })], pagos(2, '')).pacotes[0].usadas, 0, 'sem pacote_inicio legado: ninguém é atribuído');
  assert.equal(A.reconciliarPacotes([pacote({ usadas: 0 }), pacote({ usadas: 0, linha: 3 })], pagos(2)).pacotes.map((p) => p.usadas).join(), '0,0', 'mesmo paciente e início: ambíguo');
  assert.equal(A.reconciliarPacotes([pacote({ total_consultas: -1, usadas: 0 })], pagos(2)).pacotes[0].usadas, 0, 'total inválido');
  assert.equal(A.reconciliarPacotes([pacote({ total_consultas: 0, usadas: 0 })], pagos(1)).pacotes[0].usadas, 0, 'total zero nunca recebe consumo');
});

test('pagamento de pacote a mais do que o total: não grava valor impossível e AVISA (não esconde o excesso)', () => {
  const pagos = Array.from({ length: 3 }, (_, i) => ({ id: `PG${i}`, codigo_paciente: 'P9001', status: 'pago', forma: 'pacote', pacote_inicio: '2026-09-01' }));
  const r = A.reconciliarPacotes([pacote({ total_consultas: 2, usadas: 1 })], pagos);
  assert.equal(r.pacotes[0].usadas, 2, 'sobe só até o total');
  assert.equal(r.excedentes.length, 1);
  assert.equal(r.excedentes[0].consumidas, 3);
});

test('no menu: excesso de consultas pagas por pacote aparece na tela e no Registro, sem dado de paciente', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda(); gerarAReceber()');
  const pacotes = c.amb.abas.get('Pacotes');
  pacotes.linhas.push(['P9001', 1, 0, 30000, '2026-09-01']);
  for (const [i, l] of [2, 3].entries()) { c.definir('Pagamentos', l, 'codigo_paciente', 'P9001'); c.definir('Pagamentos', l, 'status', 'pago'); c.definir('Pagamentos', l, 'forma', 'pacote'); c.definir('Pagamentos', l, 'pacote_inicio', '2026-09-01'); c.definir('Pagamentos', l, 'valor_centavos', 0 * i); }
  const alvo = c.linhas('Pagamentos').findIndex((l) => l[7] === 'a_receber') + 2;
  c.selecionar('Pagamentos', alvo);
  c.rodar('marcarConsultaDePacote()');
  assert.match(c.ultimoAlerta(), /mais que o total/);
  assert.equal(pacotes.linhas[1][2], 1, 'usadas ficou no total, não passou');
  assert.match(c.registroTexto(), /mais consultas pagas por pacote/);
});

// ---------- relatório: o total precisa bater por todos os caminhos ----------

test('relatório: total original = soma por pagador = soma por forma = total exibido (400 conjuntos gerados, oráculo independente)', () => {
  const rnd = gerador(424242);
  const nomes = ['Ana Teste', 'ana  teste', 'Bruno Exemplo', 'Carla Prova', '', 'ÂNGELA Inventada'];
  const cpfs = ['', '52998224725', '12345678909', '11111111111', '123'];
  for (let n = 0; n < 400; n++) {
    const quantos = 1 + Math.floor(rnd() * 12);
    const pagamentos = Array.from({ length: quantos }, (_, i) => {
      const status = escolhe(rnd, ['pago', 'pago', 'pago', 'a_receber', 'cortesia']);
      const forma = status === 'cortesia' ? 'cortesia' : escolhe(rnd, ['pix', 'cartao', 'dinheiro', 'pacote', '', 'boleto']);
      return {
        id: `PG${n}_${i}`, status, forma, pagador_nome: escolhe(rnd, nomes), pagador_cpf: escolhe(rnd, cpfs),
        valor_centavos: escolhe(rnd, [1, 99, 10000, 15000, 123456, 0, -5, 2.5]), data_pagamento: escolhe(rnd, ['2026-09-10', '2026-09-30', '2026-08-31', '', '2026-02-30']),
      };
    });
    const rel = R.consolidarRecebimentos(pagamentos, '2026-09');
    // oráculo: regra do relatório escrita de novo, sem usar o código dele
    const contam = pagamentos.filter((p) => p.status === 'pago' && ['pix', 'cartao', 'dinheiro', ''].includes(p.forma) && /^2026-09-\d\d$/.test(p.data_pagamento)
      && F.textoParaData(p.data_pagamento) && Number.isSafeInteger(p.valor_centavos) && p.valor_centavos > 0);
    const esperado = contam.reduce((s, p) => s + p.valor_centavos, 0);
    assert.equal(rel.totalCentavos, esperado, `cenário ${n}`);
    assert.equal(rel.quantidade, contam.length);
    assert.equal(rel.pagadores.reduce((s, g) => s + g.totalCentavos, 0), esperado);
    assert.equal(Object.values(rel.porForma).reduce((s, v) => s + v, 0), esperado);
    const linhas = R.linhasAbaRelatorio(rel);
    assert.equal(linhas.find((l) => l[0] === 'TOTAL')[3], F.formatarReais(esperado));
    const csv = R.montarCsvRelatorio(rel).split('\r\n').find((l) => l.startsWith('TOTAL'));
    assert.equal(csv, `TOTAL;;${contam.length};${F.formatarReaisSimples(esperado)}`);
    const corpo = linhas.slice(3, linhas.findIndex((l) => l[0] === 'TOTAL'));
    assert.equal(corpo.length, rel.pagadores.length);
  }
});

test('relatório: cortesia, pacote e a receber nunca entram no total, mesmo com valor diferente de zero digitado por engano', () => {
  const base = { pagador_nome: 'Ana Teste', pagador_cpf: '', valor_centavos: 5000, data_pagamento: '2026-09-10' };
  const rel = R.consolidarRecebimentos([
    { ...base, id: 'a', status: 'cortesia', forma: 'cortesia' }, { ...base, id: 'b', status: 'pago', forma: 'pacote' },
    { ...base, id: 'c', status: 'a_receber', forma: '' }, { ...base, id: 'd', status: 'pago', forma: 'pix' },
  ], '2026-09');
  assert.equal(rel.totalCentavos, 5000);
});
