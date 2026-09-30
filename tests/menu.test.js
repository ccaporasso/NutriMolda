// T08: ações do menu (lógica pura) e o menu inteiro contra um Google simulado. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/Acoes.js');
const { calcularCrc16 } = require('../src/Pix.js');
const { criarAmbiente } = require('./apoio/simulacao.js');

const pag = (extra = {}) => ({ linha: 2, id: 'PG000001', id_evento: 'e1', codigo_paciente: 'P9001', pagador_nome: '', pagador_cpf: '', valor_centavos: 15000, forma: '', status: 'a_receber', data_pagamento: '', link_recibo: '', ...extra });

test('pago: só a partir de a_receber, com forma válida e data de hoje', () => {
  const r = A.aplicarPagamentoRecebido(pag(), 'pix', '2026-09-30');
  assert.equal(r.ok, true);
  assert.deepEqual([r.pagamento.status, r.pagamento.forma, r.pagamento.data_pagamento, r.pagamento.valor_centavos], ['pago', 'pix', '2026-09-30', 15000]);
  assert.equal(A.aplicarPagamentoRecebido(pag({ status: 'pago' }), 'pix', '2026-09-30').ok, false);
  assert.equal(A.aplicarPagamentoRecebido(pag({ status: 'cortesia' }), 'pix', '2026-09-30').ok, false);
  assert.equal(A.aplicarPagamentoRecebido(pag(), 'pacote', '2026-09-30').ok, false);
  assert.equal(A.aplicarPagamentoRecebido(pag({ valor_centavos: 0 }), 'pix', '2026-09-30').ok, false);
});

test('cortesia: valor zero, forma cortesia, só a partir de a_receber', () => {
  const r = A.aplicarCortesia(pag());
  assert.deepEqual([r.pagamento.status, r.pagamento.forma, r.pagamento.valor_centavos], ['cortesia', 'cortesia', 0]);
  assert.equal(A.aplicarCortesia(pag({ status: 'pago' })).ok, false);
});

test('pacote: gasta uma consulta do pacote com sobra e recusa quando não há', () => {
  const pacotes = [
    { linha: 2, codigo_paciente: 'P9002', total_consultas: 4, usadas: 0 },
    { linha: 3, codigo_paciente: 'P9001', total_consultas: 4, usadas: 4 },
    { linha: 4, codigo_paciente: 'P9001', total_consultas: 4, usadas: 1 },
  ];
  const r = A.aplicarPacote(pag(), pacotes, '2026-09-30');
  assert.equal(r.ok, true);
  assert.equal(r.pacote.linha, 4);
  assert.equal(r.pacote.usadas, 2);
  assert.deepEqual([r.pagamento.forma, r.pagamento.status, r.pagamento.valor_centavos], ['pacote', 'pago', 0]);
  assert.equal(A.aplicarPacote(pag(), [pacotes[1]], '2026-09-30').ok, false);
  assert.equal(A.aplicarPacote(pag(), [], '2026-09-30').ok, false);
});

test('consulta: realizada e faltou; cancelada não muda', () => {
  assert.equal(A.aplicarStatusConsulta({ status: 'marcada' }, 'faltou').consulta.status, 'faltou');
  assert.equal(A.aplicarStatusConsulta({ status: 'faltou' }, 'realizada').consulta.status, 'realizada');
  assert.equal(A.aplicarStatusConsulta({ status: 'cancelada' }, 'faltou').ok, false);
  assert.equal(A.aplicarStatusConsulta({ status: 'faltou' }, 'faltou').ok, false);
  assert.equal(A.aplicarStatusConsulta({ status: 'marcada' }, 'cancelada').ok, false);
});

test('Pix do pagamento usa o id do pagamento e o valor em centavos; recusa o que não está a receber', () => {
  const config = { chave_pix: 'teste@exemplo.invalid', nome_recebedor_pix: 'Dra Teste', cidade_recebedor_pix: 'Sao Paulo' };
  const r = A.montarPixDoPagamento(pag(), config);
  assert.equal(r.ok, true);
  assert.match(r.texto, /5406150\.00/);
  assert.match(r.texto, /0508PG000001/);
  assert.equal(A.montarPixDoPagamento(pag({ status: 'pago' }), config).ok, false);
  const ruim = A.montarPixDoPagamento(pag(), { ...config, nome_recebedor_pix: 'x'.repeat(40) });
  assert.equal(ruim.ok, false);
  assert.match(ruim.motivo, /nome_recebedor_pix/);
});

// ---------- menu inteiro no Google simulado ----------

const CONFIG = [
  ['nome_profissional', 'Dra. Teste'], ['crn', 'CRN-0 00000'], ['valor_primeira_consulta_centavos', '15000'], ['valor_retorno_centavos', '10000'],
  ['regra_retorno_dias', '30'], ['chave_pix', 'teste@exemplo.invalid'], ['nome_recebedor_pix', 'DRA TESTE'], ['cidade_recebedor_pix', 'SAO PAULO'],
  ['calendario_id', 'primary'], ['prefixo_evento_consulta', 'Consulta'], ['email_alertas', 'alerta@exemplo.invalid'], ['id_modelo_recibo', ''], ['id_pasta_recibos', ''],
];

function ambienteMenu(opcoes = {}) {
  const amb = criarAmbiente({ configuracoes: CONFIG, selecao: { aba: 'Pagamentos', linhas: [2] }, ...opcoes });
  amb.abas.get('Consultas').linhas.push(['e1', '2026-09-10', '09:00', 'primeira', 'P9001', 'realizada', ''], ['e2', '2026-09-20', '09:00', 'retorno', 'P9001', 'marcada', ''], ['e3', '2026-09-21', '09:00', 'retorno', 'P9002', 'cancelada', '']);
  amb.abas.get('Pagamentos').linhas.push(
    ['PG000001', 'e1', 'P9001', '', '', 15000, '', 'a_receber', '', ''],
    ['PG000002', 'e2', 'P9001', '', '', 10000, '', 'a_receber', '', ''],
    ['PG000003', 'e9', 'P9002', '', '', 10000, 'cartao', 'pago', '2026-09-01', ''],
  );
  amb.abas.get('Pacotes').linhas.push(['P9001', 2, 1, 50000, '2026-09-01']);
  amb.carregar('Esquema.js', 'Formatos.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Registro.js', 'Alertas.js', 'Execucao.js', 'LeitorAbas.js',
    'SincronizarAgenda.js', 'Pagamentos.js', 'GerarAReceber.js', 'Pix.js', 'Acoes.js', 'Recibo.js', 'GeradorRecibo.js', 'Relatorio.js', 'GerarRelatorio.js', 'Instalador.js', 'DadosTeste.js', 'GeradorTeste.js', 'Menu.js');
  return amb;
}

const dumpMenu = (itens) => itens.flatMap((i) => (i[0] === '>' ? dumpMenu(i[2]) : [i[1]])).filter(Boolean);

test('o menu tem todos os itens do lote e cada um aponta para uma função existente', () => {
  const amb = ambienteMenu();
  amb.contexto.SpreadsheetApp.getUi = () => amb.ui;
  amb.rodar('onOpen()');
  assert.equal(amb.menu.nome, 'Kit do Consultório');
  const funcoes = dumpMenu(amb.menu.itens);
  for (const f of ['sincronizarAgendaPeloMenu', 'gerarAReceberPeloMenu', 'marcarPagoPix', 'marcarPagoCartao', 'marcarPagoDinheiro', 'marcarCortesia',
    'marcarConsultaDePacote', 'gerarPixDaLinha', 'gerarReciboDaLinhaSelecionada', 'marcarConsultaRealizada', 'marcarConsultaFaltou', 'gerarRelatorioDoMes',
    'instalarPlanilha', 'criarModeloEPastaDeRecibos', 'ativarSincronizacaoAutomatica', 'testarAlertaDeFalha']) {
    assert.ok(funcoes.includes(f), `falta o item ${f}`);
    assert.equal(amb.rodar(`typeof ${f}`), 'function', `${f} não existe`);
  }
});

test('marcar como pago (Pix) em duas linhas; repetir não remarca o que já está pago', () => {
  const amb = ambienteMenu({ selecao: { aba: 'Pagamentos', linhas: [2, 3] } });
  amb.rodar('marcarPagoPix()');
  const linhas = amb.abas.get('Pagamentos').linhas;
  assert.deepEqual(linhas[1].slice(5, 9), [15000, 'pix', 'pago', '2026-09-30']);
  assert.deepEqual(linhas[2].slice(5, 9), [10000, 'pix', 'pago', '2026-09-30']);
  amb.relogio.agora += 2 * 24 * 3600 * 1000; // dois dias depois
  amb.rodar('marcarPagoCartao()');
  assert.deepEqual(amb.abas.get('Pagamentos').linhas[1].slice(6, 9), ['pix', 'pago', '2026-09-30']); // intacto
  assert.match(amb.alertas.at(-1), /já está pago/);
});

test('linha já paga misturada na seleção não impede as outras', () => {
  const amb = ambienteMenu({ selecao: { aba: 'Pagamentos', linhas: [3, 4] } });
  amb.rodar('marcarPagoDinheiro()');
  const linhas = amb.abas.get('Pagamentos').linhas;
  assert.equal(linhas[2][7], 'pago');
  assert.equal(linhas[3][6], 'cartao'); // PG000003 já estava pago: não foi tocado
  assert.match(amb.alertas.at(-1), /Feito em 1 linha/);
});

test('cortesia pede confirmação: "não" não muda nada, "sim" zera o valor', () => {
  const nao = ambienteMenu({ negar: true });
  nao.rodar('marcarCortesia()');
  assert.equal(nao.abas.get('Pagamentos').linhas[1][7], 'a_receber');
  const sim = ambienteMenu();
  sim.rodar('marcarCortesia()');
  assert.deepEqual([sim.abas.get('Pagamentos').linhas[1][5], sim.abas.get('Pagamentos').linhas[1][6], sim.abas.get('Pagamentos').linhas[1][7]], [0, 'cortesia', 'cortesia']);
});

test('pacote: usa a consulta do pacote e, esgotado, recusa a próxima', () => {
  const amb = ambienteMenu({ selecao: { aba: 'Pagamentos', linhas: [2, 3] } });
  amb.rodar('marcarConsultaDePacote()');
  assert.equal(amb.abas.get('Pacotes').linhas[1][2], 2); // usadas 1 -> 2 (total 2)
  assert.equal(amb.abas.get('Pagamentos').linhas[1][6], 'pacote');
  assert.equal(amb.abas.get('Pagamentos').linhas[2][7], 'a_receber'); // sem consulta sobrando
  assert.match(amb.alertas.at(-1), /sem pacote|não tem pacote/);
});

test('Pix da linha mostra um texto com CRC correto, valor e nome, sem pagar nada', () => {
  const amb = ambienteMenu();
  amb.rodar('gerarPixDaLinha()');
  const texto = amb.alertas.at(-1).split('\n\n').at(-1).trim();
  assert.match(texto, /^000201/);
  assert.match(texto, /5406150\.00/);
  assert.match(texto, /5909DRA TESTE/);
  assert.equal(texto.slice(-4), calcularCrc16(texto.slice(0, -4)));
});

test('Pix de pagamento que não está a receber é recusado com mensagem', () => {
  const amb = ambienteMenu({ selecao: { aba: 'Pagamentos', linhas: [4] } });
  amb.rodar('gerarPixDaLinha()');
  assert.match(amb.alertas.at(-1), /não há Pix a gerar/);
  assert.equal(amb.emails.length, 0);
});

test('consulta: marcar faltou avisa do valor a receber; cancelada é recusada', () => {
  const amb = ambienteMenu({ selecao: { aba: 'Consultas', linhas: [2] } });
  amb.rodar('marcarConsultaFaltou()');
  assert.equal(amb.abas.get('Consultas').linhas[1][5], 'faltou');
  assert.match(amb.alertas.at(-1), /valor a receber/);
  amb.selecao.linhas = [4];
  amb.rodar('marcarConsultaRealizada()');
  assert.equal(amb.abas.get('Consultas').linhas[3][5], 'cancelada');
  assert.match(amb.alertas.at(-1), /cancelada/);
});

test('aba errada ou cabeçalho selecionado: mensagem clara, sem e-mail de alerta', () => {
  const amb = ambienteMenu({ selecao: { aba: 'Consultas', linhas: [2] } });
  amb.rodar('marcarPagoPix()');
  assert.match(amb.alertas.at(-1), /Abra a aba "Pagamentos"/);
  amb.selecao.aba = 'Pagamentos';
  amb.selecao.linhas = [1];
  amb.rodar('marcarPagoPix()');
  assert.match(amb.alertas.at(-1), /não no cabeçalho/);
  assert.equal(amb.emails.length, 0);
});

test('erro inesperado no menu vai para o Registro e o e-mail, sem o texto do erro', () => {
  const amb = ambienteMenu();
  amb.contexto.Calendar = { Events: { list: () => { throw new Error('Ana S. tem diabetes'); } } };
  amb.rodar('sincronizarAgendaPeloMenu()');
  assert.equal(amb.emails.length, 1);
  const registro = amb.abas.get('Registro').linhas.slice(1).map((l) => l.join(' ')).join('\n') + JSON.stringify(amb.emails);
  assert.doesNotMatch(registro, /diabetes|Ana/);
});

test('fluxo completo de ponta a ponta com dados de teste: a receber -> pago -> relatório', () => {
  const amb = ambienteMenu({ selecao: { aba: 'Pagamentos', linhas: [2] }, resposta: '2026-09' });
  amb.contexto.DriveApp = { getFolderById: () => ({ getFilesByName: () => ({ hasNext: () => false }), createFile: () => ({}) }) };
  amb.abas.get('Configurações').linhas.find((l) => l[0] === 'id_pasta_recibos')[1] = 'pasta123';
  amb.rodar('gerarAReceberPeloMenu()'); // já existem cobranças para e1 e e2: nada novo
  assert.equal(amb.abas.get('Pagamentos').linhas.length, 4);
  amb.rodar('marcarPagoPix()');
  amb.rodar('gerarRelatorioDoMes()');
  const aba = amb.abas.get('Relatório 2026-09');
  assert.ok(aba.linhas.some((l) => l[0] === 'TOTAL' && l[3] === 'R$ 250,00')); // 150 (Pix de hoje) + 100 (cartão já pago)
});
