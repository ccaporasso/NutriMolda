// Gate B (P1): relatório do mês. Invariantes:
//   I1 falha ao gerar a aba ou o CSV nunca altera a fonte financeira (Pagamentos);
//   I2 repetir o mesmo mês converge para uma aba lógica e um CSV;
//   I3 execuções simultâneas não deixam estado misturado (lock antes de ler).
// Só dados inventados. Google simulado (E2).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio } = require('./apoio/fluxo.js');

function comPagamentoPago() {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  c.rodar('gerarAReceber()');
  const linha = c.linhaOnde('Pagamentos', 'codigo_paciente', 'P9001');
  c.selecionar('Pagamentos', linha);
  c.rodar('marcarPagoPix()');
  c.definir('Pagamentos', linha, 'pagador_nome', 'Maria Souza Teste');
  return c;
}
const fotoPagamentos = (c) => JSON.stringify(c.amb.abas.get('Pagamentos').linhas);
const totalDaAba = (c) => c.amb.abas.get('Relatório 2026-09').linhas.find((l) => l[0] === 'TOTAL')[3];
const abasDeRelatorio = (c) => [...c.amb.abas.keys()].filter((n) => n.startsWith('Relatório 2026-09'));

test('I1: falha ao salvar o CSV não altera Pagamentos; a repetição converge para uma aba e um CSV', () => {
  const c = comPagamentoPago();
  const antes = fotoPagamentos(c);
  c.drive.falhas.criarArquivo = true;
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(fotoPagamentos(c), antes);
  assert.equal(c.drive.csvsNaPasta().length, 0);
  c.drive.falhas.criarArquivo = false;
  c.rodar('gerarRelatorioDoMes()');
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(fotoPagamentos(c), antes);
  assert.equal(abasDeRelatorio(c).length, 1);
  assert.equal(c.drive.csvsNaPasta().length, 1);
  assert.equal(totalDaAba(c), 'R$ 150,00');
});

test('I1: falha ao escrever a aba (depois de limpar) não altera Pagamentos; a repetição reconstrói a aba inteira', () => {
  const c = comPagamentoPago();
  c.rodar('gerarRelatorioDoMes()');
  const antes = fotoPagamentos(c);
  const aba = c.amb.abas.get('Relatório 2026-09');
  const original = aba.getRange.bind(aba);
  aba.getRange = (...a) => { const r = original(...a); return { ...r, setNumberFormat() { return { setValues() { throw new Error('Falha ao escrever: EXCECAO_FICTICIA_ABA_001'); } }; } }; };
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(fotoPagamentos(c), antes);
  assert.equal(c.amb.emails.length, 1);
  assert.doesNotMatch(c.registroTexto(), /EXCECAO_FICTICIA/);
  aba.getRange = original;
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(totalDaAba(c), 'R$ 150,00');
  assert.equal(abasDeRelatorio(c).length, 1);
});

test('I2: o Drive cria o CSV e a resposta se perde; a repetição substitui o mesmo arquivo em vez de criar outro', () => {
  const c = comPagamentoPago();
  c.drive.falhas.criarArquivoRespostaPerdida = true;
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(c.drive.csvsNaPasta().length, 1);
  c.drive.falhas.criarArquivoRespostaPerdida = false;
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(c.drive.csvsNaPasta().length, 1);
});

test('I3: a execução que esperava a trava relê os pagamentos e produz o resultado final correto, um CSV só', () => {
  const c = comPagamentoPago();
  let esperando = true;
  const linha2 = c.linhaOnde('Pagamentos', 'codigo_paciente', 'P9002');
  c.amb.contexto.LockService = {
    getScriptLock: () => ({
      tryLock() {
        if (esperando) { // enquanto B espera a trava, A recebe mais um pagamento e gera o relatório dele
          esperando = false;
          c.selecionar('Pagamentos', linha2);
          c.rodar('marcarPagoDinheiro()');
          c.rodar('gerarRelatorioMensal("2026-09")');
        }
        return true;
      },
      releaseLock() {},
    }),
  };
  c.rodar('gerarRelatorioMensal("2026-09")');
  const pagos = c.linhas('Pagamentos').filter((l) => l[7] === 'pago' && l[6] !== 'pacote').reduce((t, l) => t + l[5], 0);
  assert.equal(c.drive.csvsNaPasta().length, 1);
  assert.match(totalDaAba(c), /^R\$ /);
  assert.ok(pagos > 15000, 'o segundo pagamento entrou');
});

test('I3: sem trava, o relatório não escreve nada', () => {
  const c = comPagamentoPago();
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  c.rodar('gerarRelatorioDoMes()');
  assert.match(c.ultimoAlerta(), /Outra operação está em andamento/);
  assert.equal(abasDeRelatorio(c).length, 0);
  assert.equal(c.drive.csvsNaPasta().length, 0);
});
