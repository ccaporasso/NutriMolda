// Achados da revisão Opus (A1, M1 a M4). Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/Registro.js');
const P = require('../src/Pagamentos.js');
const { criarConsultorio } = require('./apoio/fluxo.js');

test('M4: causas de ErroDeUso vêm de lista fechada e não copiam a mensagem', () => {
  const e = (m) => Object.assign(new Error(m), { name: 'ErroDeUso' });
  assert.equal(R.causaDeUso(e('Outra sincronização está em andamento. Tente de novo')), 'trava');
  assert.equal(R.causaDeUso(e('A aba "Consultas" é de uma versão anterior do kit')), 'cabecalho');
  assert.equal(R.causaDeUso(e('chave_pix vazia Maria Souza Teste')), 'configuracao');
  for (const texto of Object.values(R.CAUSAS_DE_USO)) assert.doesNotMatch(texto, /Maria|@/);
});

test('M4: cabeçalho alterado no gatilho registra a causa e manda no máximo um e-mail por dia', () => {
  const c = criarConsultorio();
  c.amb.abas.get('Consultas').linhas[0][2] = 'hora_errada';
  c.rodar('sincronizarAgendaAutomatica()');
  c.rodar('sincronizarAgendaAutomatica()');
  assert.match(c.registroTexto(), /cabeçalho de uma aba foi alterado/);
  assert.equal(c.amb.emails.length, 1);
});

test('M3: Consultas e Pagamentos aumentam a grade antes de gravar além das 1000 linhas', () => {
  const c = criarConsultorio();
  const aba = c.amb.abas.get('Consultas');
  aba.maxLinhas = 1; // grade já cheia: só o cabeçalho
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').length, 9);
  assert.ok(aba.maxLinhas >= 10);
  assert.ok(aba.formatos.some((f) => f.linha === 2 && f.f === '@'), 'formato texto reaplicado nas linhas novas');
});

test('A1: primeira consulta de paciente com consulta anterior não gera cobrança e avisa a linha', () => {
  const consultas = [
    { linha: 2, id_evento: 'e1', data: '2026-09-01', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'realizada' },
    { linha: 3, id_evento: 'e2', data: '2026-10-05', hora: '10:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada' },
  ];
  const plano = P.planejarAReceber({ consultas, pagamentos: [], config: { valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000 } });
  assert.deepEqual(plano.novos.map((n) => n.id_evento), ['e1']);
  assert.match(plano.avisos.join(' '), /linha\(s\) 3/);
  consultas[1].tipo = 'retorno';
  assert.deepEqual(P.planejarAReceber({ consultas, pagamentos: [], config: { valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000 } }).novos.map((n) => n.valor_centavos), [15000, 10000]);
});

test('A1: a consulta cancelada não conta como histórico para a guarda de cobrança', () => {
  const consultas = [
    { linha: 2, id_evento: 'e1', data: '2026-09-01', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'cancelada' },
    { linha: 3, id_evento: 'e2', data: '2026-10-05', hora: '10:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada' },
  ];
  const plano = P.planejarAReceber({ consultas, pagamentos: [], config: { valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000 } });
  assert.deepEqual(plano.novos.map((n) => n.id_evento), ['e2']);
});
