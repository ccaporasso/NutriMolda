// T07: valores a receber. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/Pagamentos.js');
const { criarAmbiente } = require('./apoio/simulacao.js');

const config = { valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000 };
const consulta = (id, tipo, status, extra = {}) => ({
  id_evento: id, data: '2026-09-10', hora: '09:00', tipo, codigo_paciente: 'P9001', status, ...extra,
});

test('consulta marcada ou realizada sem pagamento gera a_receber com o preço do tipo', () => {
  const p = P.planejarAReceber({ consultas: [consulta('e1', 'primeira', 'realizada'), consulta('e2', 'retorno', 'marcada')], pagamentos: [], config });
  assert.deepEqual(p.novos.map((n) => [n.id, n.id_evento, n.valor_centavos, n.status]), [
    ['PG000001', 'e1', 15000, 'a_receber'], ['PG000002', 'e2', 10000, 'a_receber'],
  ]);
  assert.deepEqual(P.linhaPagamento(p.novos[0]), ['PG000001', 'e1', 'P9001', '', '', 15000, '', 'a_receber', '', '']);
});

test('não duplica: consulta que já tem pagamento (em qualquer status) é pulada', () => {
  const pagamentos = [{ id: 'PG000007', id_evento: 'e1', status: 'pago' }];
  const p = P.planejarAReceber({ consultas: [consulta('e1', 'primeira', 'realizada'), consulta('e2', 'primeira', 'marcada')], pagamentos, config });
  assert.equal(p.novos.length, 1);
  assert.equal(p.novos[0].id_evento, 'e2');
  assert.equal(p.novos[0].id, 'PG000008'); // continua depois do maior id usado
  assert.equal(p.contagens.jaTinham, 1);
});

test('rodar duas vezes seguidas não cria nada na segunda', () => {
  const consultas = [consulta('e1', 'primeira', 'realizada')];
  const primeira = P.planejarAReceber({ consultas, pagamentos: [], config });
  const pagamentos = primeira.novos.map((n) => ({ ...n }));
  assert.equal(P.planejarAReceber({ consultas, pagamentos, config }).novos.length, 0);
});

test('preço ausente, zero ou inválido nunca gera cobrança de R$ 0,00 e avisa', () => {
  for (const preco of [null, 0, undefined, -5, 1.5]) {
    const p = P.planejarAReceber({ consultas: [consulta('e1', 'primeira', 'marcada')], pagamentos: [], config: { valor_primeira_consulta_centavos: preco } });
    assert.equal(p.novos.length, 0);
    assert.equal(p.contagens.semPreco, 1);
    assert.match(p.avisos.join(' '), /valor_primeira_consulta_centavos/);
  }
});

test('consulta sem paciente, faltou e cancelada não geram cobrança', () => {
  const p = P.planejarAReceber({
    consultas: [consulta('e1', 'primeira', 'marcada', { codigo_paciente: '' }), consulta('e2', 'primeira', 'faltou'), consulta('e3', 'primeira', 'cancelada')],
    pagamentos: [], config,
  });
  assert.equal(p.novos.length, 0);
  assert.equal(p.contagens.semPaciente, 1);
  assert.match(p.avisos[0], /codigo_paciente/);
});

test('tipo inválido é recusado sem quebrar as outras consultas', () => {
  const p = P.planejarAReceber({ consultas: [consulta('e1', '', 'marcada'), consulta('e2', 'retorno', 'marcada')], pagamentos: [], config });
  assert.equal(p.novos.length, 1);
  assert.equal(p.contagens.semTipo, 1);
});

test('consulta cancelada que ainda tem valor a receber vira aviso, nunca é apagada', () => {
  const p = P.planejarAReceber({
    consultas: [consulta('e1', 'primeira', 'cancelada')],
    pagamentos: [{ id: 'PG000001', id_evento: 'e1', status: 'a_receber' }], config,
  });
  assert.equal(p.novos.length, 0);
  assert.match(p.avisos.join(' '), /cancelada/);
});

test('Google simulado: gerarAReceber grava uma vez e a segunda execução não muda nada', () => {
  const amb = criarAmbiente({ configuracoes: [
    ['nome_profissional', 'Dra. Teste'], ['crn', 'CRN-0 00000'], ['valor_primeira_consulta_centavos', '15000'],
    ['valor_retorno_centavos', '10000'], ['regra_retorno_dias', '30'], ['chave_pix', 'teste@exemplo.invalid'],
    ['nome_recebedor_pix', 'DRA TESTE'], ['cidade_recebedor_pix', 'SAO PAULO'], ['calendario_id', 'primary'],
    ['prefixo_evento_consulta', 'Consulta'], ['email_alertas', 'alerta@exemplo.invalid'], ['id_modelo_recibo', ''], ['id_pasta_recibos', ''],
  ] });
  amb.abas.get('Consultas').linhas.push(['e1', '2026-09-10', '09:00', 'primeira', 'P9001', 'realizada', ''], ['e2', '2026-09-20', '09:00', 'retorno', 'P9001', 'marcada', '']);
  amb.carregar('Esquema.js', 'Formatos.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Registro.js', 'Alertas.js', 'Execucao.js', 'LeitorAbas.js', 'Pagamentos.js', 'GerarAReceber.js');
  amb.rodar('gerarAReceber()');
  const pag = amb.abas.get('Pagamentos').linhas;
  assert.equal(pag.length, 3);
  assert.deepEqual(pag[1], ['PG000001', 'e1', 'P9001', '', '', 15000, '', 'a_receber', '', '']);
  assert.equal(pag[2][5], 10000);
  amb.rodar('gerarAReceber()');
  assert.equal(amb.abas.get('Pagamentos').linhas.length, 3);
});
