// T24 (esqueleto): modos de acompanhamento e limite semanal. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/Modos.js');
const { LISTAS } = require('../src/Esquema.js');

const pac = (extra = {}) => ({ modo_acompanhamento: 'leve', autorizou_mensagens_em: '2026-09-01 10:00:00', ativo: true, ...extra });

test('os três modos são os mesmos da aba Pacientes', () => {
  assert.deepEqual(M.MODOS_ACOMPANHAMENTO, LISTAS.modo_acompanhamento);
  assert.deepEqual(Object.keys(M.LIMITE_SEMANAL_POR_MODO).sort(), [...M.MODOS_ACOMPANHAMENTO].sort());
});

test('porta aberta nunca puxa conversa; leve e próximo respeitam o limite da semana', () => {
  assert.equal(M.podeMandarMensagem({ paciente: pac({ modo_acompanhamento: 'porta_aberta' }), enviadasNaSemana: 0 }).pode, false);
  assert.deepEqual(M.podeMandarMensagem({ paciente: pac(), enviadasNaSemana: 0 }), { pode: true, motivo: '', restantes: 1 });
  assert.equal(M.podeMandarMensagem({ paciente: pac(), enviadasNaSemana: 1 }).pode, false);
  const p = pac({ modo_acompanhamento: 'proximo' });
  assert.equal(M.podeMandarMensagem({ paciente: p, enviadasNaSemana: 1 }).restantes, 1);
  assert.equal(M.podeMandarMensagem({ paciente: p, enviadasNaSemana: 2 }).pode, false);
});

test('sem autorização, inativo, sem modo ou contagem inválida: não pode, com motivo em português', () => {
  const casos = [
    [pac({ autorizou_mensagens_em: '' }), 0, /autorizou/], [pac({ ativo: false }), 0, /inativo/],
    [pac({ modo_acompanhamento: '' }), 0, /modo/], [pac({ modo_acompanhamento: 'diario' }), 0, /modo/],
    [pac(), -1, /Contagem/], [pac(), 1.5, /Contagem/], [pac(), undefined, /Contagem/], [null, 0, /inativo/],
  ];
  for (const [paciente, n, esperado] of casos) {
    const r = M.podeMandarMensagem({ paciente, enviadasNaSemana: n });
    assert.equal(r.pode, false);
    assert.match(r.motivo, esperado);
  }
});

test('semana começa na segunda-feira', () => {
  assert.equal(M.inicioDaSemana('2026-09-30'), '2026-09-28'); // quarta
  assert.equal(M.inicioDaSemana('2026-09-28'), '2026-09-28'); // segunda
  assert.equal(M.inicioDaSemana('2026-10-04'), '2026-09-28'); // domingo
  assert.equal(M.inicioDaSemana('2026-10-05'), '2026-10-05');
  assert.throws(() => M.inicioDaSemana('2026-02-30'), /inválida/);
  assert.throws(() => M.inicioDaSemana('30/09/2026'), /inválida/);
});

test('D9: o módulo não conhece pagamento nem cobrança (não responder nunca gera cobrança)', () => {
  const texto = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'Modos.js'), 'utf8');
  assert.doesNotMatch(texto.replace(/\/\/.*$/gm, ''), /valor_centavos|Pagamento|cobran|precoParaCobranca/i);
});
