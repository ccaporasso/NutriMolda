// T21 (esqueleto): painel de presença. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/Presenca.js');

const hoje = '2026-09-30';
const pac = (codigo, extra = {}) => ({ codigo, autorizou_mensagens_em: '2026-08-01 10:00:00', ativo: true, ...extra });
const r = (codigo, dia, resposta, nota = '') => ({ data_hora: `${dia} 09:00:00`, codigo_paciente: codigo, resposta, nota });
const calc = (o) => P.calcularPresenca({ pacientes: [], respostas: [], consultas: [], hojeTexto: hoje, ...o });
const sinaisDe = (lista, codigo) => (lista.find((x) => x.codigo === codigo) || { sinais: [] }).sinais;

test('"ainda não" duas vezes seguidas aparece; uma só ou intercalada com "sim" não', () => {
  const respostas = [r('P9001', '2026-09-16', 'ainda_nao'), r('P9001', '2026-09-23', 'ainda_nao'),
    r('P9002', '2026-09-16', 'ainda_nao'), r('P9002', '2026-09-23', 'sim'),
    r('P9003', '2026-09-23', 'ainda_nao')];
  const l = calc({ pacientes: [pac('P9001'), pac('P9002'), pac('P9003')], respostas });
  assert.ok(sinaisDe(l, 'P9001').includes('ainda_nao_seguido'));
  assert.ok(!sinaisDe(l, 'P9002').includes('ainda_nao_seguido'));
  assert.ok(!sinaisDe(l, 'P9003').includes('ainda_nao_seguido'));
});

test('silêncio: conta da última resposta; o limite exato (14 dias) conta', () => {
  const respostas = [r('P9001', '2026-09-16', 'sim'), r('P9002', '2026-09-17', 'sim')];
  const l = calc({ pacientes: [pac('P9001'), pac('P9002')], respostas });
  assert.ok(sinaisDe(l, 'P9001').includes('silencio')); // 14 dias: no limite
  assert.ok(!sinaisDe(l, 'P9002').includes('silencio')); // 13 dias: ainda dentro do prazo
});

test('silêncio: sem nenhuma resposta e autorizou há mais de 14 dias aparece; sem data de autorização, não', () => {
  const l = calc({ pacientes: [pac('P9003'), pac('P9004', { autorizou_mensagens_em: '' })] });
  assert.ok(sinaisDe(l, 'P9003').includes('silencio'));
  assert.deepEqual(sinaisDe(l, 'P9004'), []);
});

test('nota escrita aparece com a nota mais recente; nota em branco não', () => {
  const l = calc({ pacientes: [pac('P9001'), pac('P9002')], respostas: [r('P9001', '2026-09-29', 'sim', 'preciso conversar'), r('P9002', '2026-09-29', 'sim', '  ')] });
  assert.ok(sinaisDe(l, 'P9001').includes('nota_escrita'));
  assert.ok(!sinaisDe(l, 'P9002').includes('nota_escrita'));
});

test('retorno sem data: realizada há 7 dias ou mais e nenhuma consulta marcada depois; cancelada não conta', () => {
  const consultas = [
    { data: '2026-09-10', codigo_paciente: 'P9001', status: 'realizada' },
    { data: '2026-09-10', codigo_paciente: 'P9002', status: 'realizada' }, { data: '2026-10-15', codigo_paciente: 'P9002', status: 'marcada' },
    { data: '2026-09-10', codigo_paciente: 'P9003', status: 'realizada' }, { data: '2026-10-15', codigo_paciente: 'P9003', status: 'cancelada' },
    { data: '2026-09-27', codigo_paciente: 'P9004', status: 'realizada' },
  ];
  const l = calc({ pacientes: ['P9001', 'P9002', 'P9003', 'P9004'].map((c) => pac(c, { autorizou_mensagens_em: '2026-09-29 10:00:00' })), consultas });
  assert.ok(sinaisDe(l, 'P9001').includes('retorno_sem_data'));
  assert.ok(!sinaisDe(l, 'P9002').includes('retorno_sem_data'));
  assert.ok(sinaisDe(l, 'P9003').includes('retorno_sem_data'));
  assert.ok(!sinaisDe(l, 'P9004').includes('retorno_sem_data')); // só 3 dias
});

test('paciente inativo nunca aparece; ordem: mais sinais primeiro, depois o código', () => {
  const respostas = [r('P9002', '2026-08-01', 'ainda_nao'), r('P9002', '2026-08-08', 'ainda_nao', 'oi')];
  const l = calc({ pacientes: [pac('P9001', { ativo: false }), pac('P9002'), pac('P9003')], respostas });
  assert.ok(!l.some((x) => x.codigo === 'P9001'));
  assert.equal(l[0].codigo, 'P9002');
  assert.equal(l[0].sinais.length, 3);
});

test('resumo usa só código e rótulo; sem paciente com sinal, diz que está tudo tranquilo', () => {
  assert.match(P.resumirPresenca([]), /Nenhum paciente/);
  const t = P.resumirPresenca([{ codigo: 'P9001', sinais: ['silencio', 'nota_escrita'] }]);
  assert.match(t, /^P9001: /);
  assert.doesNotMatch(t, /undefined/);
});
