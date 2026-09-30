// Integração: o fluxo inteiro do consultório contra um Google simulado (planilha, agenda, Drive, Docs).
// agenda -> consulta -> cobrança -> pagamento -> recibo -> relatório. Só dados inventados.
// Os totais esperados são somas feitas à mão neste arquivo, não calculadas pelo código testado.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio, textoQuePodeVazar } = require('./apoio/fluxo.js');

const NOMES_FICTICIOS = /Ana|Bruno|Carla|Diego|Elisa|Fábio|Maria|João|Fulano|exemplo\.invalid|529\.?982/;

function fluxoAteOPagamento() {
  const c = criarConsultorio();

  // 1. agenda -> consultas
  c.rodar('sincronizarAgenda()');
  // 2. ela marca as três consultas que já aconteceram
  for (const codigo of ['P9001', 'P9002', 'P9003']) {
    const primeira = c.linhas('Consultas').find((l) => l[4] === codigo && l[3] === 'primeira');
    c.selecionar('Consultas', c.linhaOnde('Consultas', 'id_evento', primeira[0]));
    c.rodar('marcarConsultaRealizada()');
  }
  // 3. consulta -> cobrança
  c.rodar('gerarAReceber()');
  return c;
}

function pagar(c, codigo, forma, nome, cpf) {
  const consulta = c.linhas('Consultas').find((l) => l[4] === codigo && l[3] === 'primeira');
  const linha = c.linhaOnde('Pagamentos', 'id_evento', consulta[0]);
  c.selecionar('Pagamentos', linha);
  c.rodar({ pix: 'marcarPagoPix()', cartao: 'marcarPagoCartao()', dinheiro: 'marcarPagoDinheiro()' }[forma]);
  c.definir('Pagamentos', linha, 'pagador_nome', nome);
  c.definir('Pagamentos', linha, 'pagador_cpf', cpf);
  return linha;
}

test('agenda vira consultas: 9 linhas, uma a identificar, primeira x retorno certos', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  const consultas = c.linhas('Consultas');
  assert.equal(consultas.length, 9);
  assert.equal(consultas.filter((l) => l[4] === '').length, 1); // Fulano D.: paciente desconhecido
  assert.equal(consultas.filter((l) => l[3] === 'primeira').length, 7); // 6 pacientes + o desconhecido
  assert.equal(consultas.filter((l) => l[3] === 'retorno').length, 2); // P9001 e P9003 voltam depois
  assert.ok(consultas.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l[1]) && /^\d{2}:\d{2}$/.test(l[2])), 'data e hora precisam ser texto');
});

test('consultas viram cobranças: 8 (a do desconhecido fica de fora), R$ 1.100,00 no total', () => {
  const c = fluxoAteOPagamento();
  const pagamentos = c.linhas('Pagamentos');
  assert.equal(pagamentos.length, 8);
  assert.deepEqual(pagamentos.map((l) => l[0]), ['PG000001', 'PG000002', 'PG000003', 'PG000004', 'PG000005', 'PG000006', 'PG000007', 'PG000008']);
  assert.ok(pagamentos.every((l) => l[7] === 'a_receber' && l[6] === ''));
  // 6 primeiras x 150,00 + 2 retornos x 100,00, somado à mão
  assert.equal(pagamentos.reduce((s, l) => s + l[5], 0), 6 * 15000 + 2 * 10000);
  assert.match(c.amb.alertas.join('\n'), /Consultas novas|Consulta realizada|Feito em 1 linha/);
  assert.equal(c.linhas('Consultas').filter((l) => l[5] === 'realizada').length, 3);
});

test('fluxo completo: pago -> recibo em PDF -> relatório com os totais conferidos à mão', () => {
  const c = fluxoAteOPagamento();
  const lPix = pagar(c, 'P9001', 'pix', 'Maria Souza Teste', '52998224725');
  pagar(c, 'P9002', 'cartao', 'Bruno Melo Teste', '');
  pagar(c, 'P9003', 'dinheiro', 'Maria Souza Teste', '52998224725'); // mesma pessoa paga duas consultas

  // recibo do pagamento em Pix
  c.selecionar('Pagamentos', lPix);
  c.rodar('gerarReciboDaLinhaSelecionada()');
  const pdfs = c.drive.pdfsNaPasta();
  assert.equal(pdfs.length, 1);
  assert.equal(pdfs[0].nome, `Recibo-${c.celula('Pagamentos', lPix, 'id')}-P9001.pdf`);
  assert.match(c.celula('Pagamentos', lPix, 'link_recibo'), /^https:\/\/exemplo\.invalid\//);
  assert.match(pdfs[0].texto, /Maria Souza Teste/);
  assert.match(pdfs[0].texto, /R\$ 150,00/);
  assert.match(pdfs[0].texto, /CPF: 529\.982\.247-25/);
  assert.match(pdfs[0].texto, /Dra\. Teste Exemplo/);
  assert.doesNotMatch(pdfs[0].texto, /\{\{/);

  // relatório do mês: 3 recebimentos de R$ 150,00 = R$ 450,00, em 2 pagadores
  c.rodar('gerarRelatorioDoMes()');
  const aba = c.amb.abas.get('Relatório 2026-09');
  assert.ok(aba, 'aba do relatório não foi criada');
  const total = aba.linhas.find((l) => l[0] === 'TOTAL');
  assert.deepEqual([total[2], total[3]], [3, 'R$ 450,00']);
  const maria = aba.linhas.find((l) => l[0] === 'Maria Souza Teste');
  assert.deepEqual([maria[1], maria[2], maria[3]], ['529.982.247-25', 2, 'R$ 300,00']);
  const csv = c.drive.csvsNaPasta();
  assert.equal(csv.length, 1);
  assert.equal(csv[0].nome, 'Relatorio-2026-09.csv');
  assert.match(csv[0].conteudo, /Maria Souza Teste;529\.982\.247-25;2;300,00/);
  assert.match(csv[0].conteudo, /TOTAL;;3;450,00/);
});

test('rodar tudo de novo não duplica nada (consulta, cobrança, pagamento, recibo, relatório)', () => {
  const c = fluxoAteOPagamento();
  const lPix = pagar(c, 'P9001', 'pix', 'Maria Souza Teste', '52998224725');
  c.selecionar('Pagamentos', lPix);
  c.rodar('gerarReciboDaLinhaSelecionada()');
  c.rodar('gerarRelatorioDoMes()');
  const foto = () => JSON.stringify(['Consultas', 'Pagamentos', 'Pacotes'].map((a) => c.linhas(a)))
    + c.drive.pdfsNaPasta().length + c.drive.csvsNaPasta().length + c.amb.abas.size;
  const antes = foto();

  c.rodar('sincronizarAgenda()');
  c.rodar('gerarAReceber()');
  c.selecionar('Pagamentos', lPix);
  c.rodar('marcarPagoPix()'); // já pago: recusado, sem remarcar
  c.rodar('gerarReciboDaLinhaSelecionada()'); // já tem recibo: não gera outro
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(foto(), antes);
  assert.match(c.amb.alertas.join('\n'), /já tem recibo/);
});

test('cancelamento na agenda: consulta cancelada, cobrança em aberto vira aviso, nada é apagado', () => {
  const c = fluxoAteOPagamento();
  const p9004 = c.linhas('Consultas').find((l) => l[4] === 'P9004');
  const alvo = c.eventos.findIndex((e) => e.id === p9004[0]);
  c.eventos[alvo] = { id: p9004[0], status: 'cancelled' };

  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').find((l) => l[0] === p9004[0])[5], 'cancelada');
  const antes = c.linhas('Pagamentos').length;
  c.amb.alertas.length = 0;
  c.rodar('gerarAReceberPeloMenu()');
  assert.equal(c.linhas('Pagamentos').length, antes); // a cobrança continua lá, para ela decidir
  assert.match(c.ultimoAlerta(), /cancelada\(s\) ainda têm valor a receber/);
  // marcar como cortesia resolve
  const linha = c.linhaOnde('Pagamentos', 'id_evento', p9004[0]);
  c.selecionar('Pagamentos', linha);
  c.rodar('marcarCortesia()');
  assert.deepEqual([c.celula('Pagamentos', linha, 'status'), c.celula('Pagamentos', linha, 'valor_centavos')], ['cortesia', 0]);
});

test('paciente a identificar: depois de ela preencher o código, a próxima cobrança nasce sem duplicar', () => {
  const c = fluxoAteOPagamento();
  const semCodigo = c.linhaOnde('Consultas', 'codigo_paciente', '');
  c.definir('Consultas', semCodigo, 'codigo_paciente', 'P9001');
  c.rodar('sincronizarAgenda()'); // não sobrescreve o código dela
  assert.equal(c.celula('Consultas', semCodigo, 'codigo_paciente'), 'P9001');
  // A1: consulta 'primeira' de paciente que já tem consulta anterior não é cobrada; ela corrige o tipo e gera de novo.
  c.rodar('gerarAReceberPeloMenu()');
  assert.equal(c.linhas('Pagamentos').length, 8);
  assert.match(c.ultimoAlerta(), /como "primeira", mas o paciente já tem consulta anterior/);
  c.definir('Consultas', semCodigo, 'tipo', 'retorno');
  c.rodar('gerarAReceber()');
  assert.equal(c.linhas('Pagamentos').length, 9);
  c.rodar('gerarAReceber()');
  assert.equal(c.linhas('Pagamentos').length, 9);
});

test('privacidade: Registro, e-mails de alerta e nomes de arquivo não têm nome, e-mail nem CPF', () => {
  const c = fluxoAteOPagamento();
  const lPix = pagar(c, 'P9001', 'pix', 'Maria Souza Teste', '52998224725');
  c.selecionar('Pagamentos', lPix);
  c.rodar('gerarReciboDaLinhaSelecionada()');
  c.rodar('gerarRelatorioDoMes()');
  c.rodar('testarAlertaDeFalha()');
  assert.doesNotMatch(textoQuePodeVazar(c), NOMES_FICTICIOS);
  assert.ok(c.registroTexto().length > 0);
});

test('o menu monta e todo item aponta para uma função que existe', () => {
  const c = criarConsultorio();
  c.amb.contexto.SpreadsheetApp.getUi = () => c.amb.ui;
  c.rodar('onOpen()');
  const nomes = (itens) => itens.flatMap((i) => (i[0] === '>' ? nomes(i[2]) : [i[1]])).filter(Boolean);
  const funcoes = nomes(c.amb.menu.itens);
  assert.ok(funcoes.length >= 14);
  for (const f of funcoes) if (!/^(criarDadosDeTeste|apagarDadosDeTeste)$/.test(f)) assert.equal(c.rodar(`typeof ${f}`), 'function', f);
});
