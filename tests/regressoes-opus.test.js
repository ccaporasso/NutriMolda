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
  assert.equal(R.causaDeUso(e('A aba "Consultas" não existe. Use o menu')), 'aba');
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

// ---------- Conferência das correções e achados baixos (B1 a B7). Só dados inventados. ----------
const Rel = require('../src/Relatorio.js');
const Pix = require('../src/Pix.js');

// Consultório com cobranças geradas e o pagamento da primeira consulta de P9001 pago em Pix, pronto para recibo.
function comPagamentoPago(nome = 'Maria Souza Teste') {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  c.rodar('gerarAReceber()');
  const consulta = c.linhas('Consultas').find((l) => l[4] === 'P9001' && l[3] === 'primeira');
  const linha = c.linhaOnde('Pagamentos', 'id_evento', consulta[0]);
  c.selecionar('Pagamentos', linha);
  c.rodar('marcarPagoPix()');
  c.definir('Pagamentos', linha, 'pagador_nome', nome);
  return { c, linha };
}

test('M2: o valor entra no recibo com o cifrão, por troca literal (sem replaceText)', () => {
  const { c, linha } = comPagamentoPago();
  const r = c.rodar(`gerarRecibo(${linha})`);
  assert.ok(r.link);
  const [pdf] = c.drive.pdfsNaPasta();
  assert.match(pdf.texto, /a quantia de R\$ 150,00, referente/);
  assert.doesNotMatch(pdf.texto, /\\|\{\{/);
});

test('M2: nome com chaves não vira campo do modelo nem prende a troca em laço', () => {
  const { c, linha } = comPagamentoPago('Maria {{pagador}} Teste');
  c.rodar(`gerarRecibo(${linha})`);
  assert.match(c.drive.pdfsNaPasta()[0].texto, /Recebi de Maria pagador Teste/);
});

test('B4: falha ao mandar a cópia para a lixeira não esconde o recibo gerado e avisa', () => {
  const { c, linha } = comPagamentoPago();
  const update = c.drive.Drive.Files.update;
  c.drive.Drive.Files.update = (recurso, ...resto) => {
    if (recurso && recurso.trashed) throw new TypeError('Sem permissão');
    return update(recurso, ...resto);
  };
  const r = c.rodar(`gerarRecibo(${linha})`);
  assert.ok(r.link);
  assert.equal(r.rascunhoFicou, true);
  assert.equal(c.celula('Pagamentos', linha, 'link_recibo'), r.link);
  assert.match(c.registroTexto(), /não foi para a lixeira \(tipo TypeError\)/);
  assert.doesNotMatch(c.registroTexto(), /Maria/);
});

test('B1: linhas reordenadas durante a sincronização não recebem dados de outra consulta', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  const original = c.eventos[0];
  c.eventos[0] = { ...original, start: { dateTime: '2026-10-20T08:00:00-03:00' } }; // remarcado
  const consultas = c.amb.abas.get('Consultas').linhas;
  const i = consultas.findIndex((l) => l[0] === original.id);
  const list = c.amb.contexto.Calendar.Events.list;
  c.amb.contexto.Calendar.Events.list = (...a) => { // ela ordena a aba enquanto o kit lê a agenda
    [consultas[i], consultas[i + 1]] = [consultas[i + 1], consultas[i]];
    return list(...a);
  };
  const vizinha = consultas[i + 1].slice(); // a que vai para o lugar da remarcada
  const plano = c.rodar('sincronizarAgenda()');
  assert.deepEqual(consultas.find((l) => l[0] === vizinha[0]), vizinha); // a vizinha não foi sobrescrita
  assert.equal(consultas.filter((l) => l[0] === original.id).length, 1);
  assert.match(plano.avisos.join(' '), /mudaram de lugar durante a sincronização/);
  c.amb.contexto.Calendar.Events.list = list;
  c.rodar('sincronizarAgenda()'); // na próxima, a remarcação entra na linha certa
  assert.equal(consultas.find((l) => l[0] === original.id)[1], '2026-10-20');
});

test('B1: gravação pelo menu recusa linha que mudou e segue com as outras', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  c.rodar('gerarAReceber()');
  assert.throws(() => c.rodar("gravarLinha('Pagamentos', 2, ['PG999999', 'x'])"), /mudou enquanto o kit trabalhava/);
  assert.equal(c.celula('Pagamentos', 2, 'id'), 'PG000001');
  assert.throws(() => c.rodar("gravarCelula('Consultas', 2, 'status', 'faltou', { id_evento: 'outro' })"), /mudou/);
  assert.notEqual(c.celula('Consultas', 2, 'status'), 'faltou');
});

test('B2: o instalador põe a planilha no fuso de São Paulo', () => {
  const c = criarConsultorio();
  c.amb.planilha.fuso = 'Etc/UTC';
  for (const f of c.amb.abas.values()) f.getProtections = () => [];
  c.rodar('instalarPlanilha()');
  assert.equal(c.amb.planilha.fuso, 'America/Sao_Paulo');
  assert.match(c.ultimoAlerta(), /fuso horário da planilha foi ajustado/);
});

test('B3: pagamento pago com forma desconhecida não some do relatório em silêncio', () => {
  const r = Rel.consolidarRecebimentos([
    { id: 'PG000001', status: 'pago', forma: 'pix', data_pagamento: '2026-09-10', valor_centavos: 15000, pagador_nome: 'Ana Teste', pagador_cpf: '' },
    { id: 'PG000002', status: 'pago', forma: 'transferencia', data_pagamento: '2026-09-11', valor_centavos: 10000, pagador_nome: 'Bia Teste', pagador_cpf: '' },
  ], '2026-09');
  assert.equal(r.totalCentavos, 15000);
  assert.equal(r.formaDesconhecida, 1);
  assert.match(r.avisos.join(' '), /PG000002 .*forma de pagamento desconhecida/);
});

test('B5: chave Pix fora do formato é recusada sem repetir a chave; formatos válidos passam', () => {
  for (const ok of ['ana@exemplo.invalid', '52998224725', '+5511900000000', '12345678000195', '123e4567-e89b-12d3-a456-426614174000']) {
    assert.equal(Pix.problemaNaChavePix(ok), '', ok);
  }
  for (const [ruim, motivo] of [['11912345678', /não é um CPF válido.*\+55/], ['529.982.247-25', /pontos, traços/], ['(11) 90000-0000', /pontos, traços/], ['chave errada', /não parece/]]) {
    const m = Pix.problemaNaChavePix(ruim);
    assert.match(m, motivo);
    assert.ok(!m.includes(ruim));
  }
  assert.throws(() => Pix.gerarPixCopiaECola({ chave: '529.982.247-25', nome: 'Teste', cidade: 'Sao Paulo', valorCentavos: 100 }), /pontos, traços/);
});

test('B6: erro inesperado nos itens de menu de instalação e do gerador vai ao Registro e ao e-mail', () => {
  const c = criarConsultorio();
  c.amb.contexto.ScriptApp.getProjectTriggers = () => { throw new TypeError('cota Maria'); };
  c.rodar('ativarSincronizacaoAutomatica()'); // não estoura na tela: mensagem clara
  assert.match(c.registroTexto(), /Falha no módulo sincronizacao \(tipo TypeError\)/);
  assert.equal(c.amb.emails.length, 1);
  assert.throws(() => c.rodar("comRegistroDeFalha_('teste', () => { throw new RangeError('x'); })"), /^RangeError: x$/);
  assert.match(c.registroTexto(), /Falha no módulo teste \(tipo RangeError\)/);
  assert.equal(c.amb.emails.length, 2);
  assert.throws(() => c.rodar("comRegistroDeFalha_('teste', () => { throw erroDeUso_('uso'); })"), /uso/);
  assert.equal(c.amb.emails.length, 2); // problema de uso não gera e-mail
  assert.doesNotMatch(c.registroTexto(), /Maria/);
});
