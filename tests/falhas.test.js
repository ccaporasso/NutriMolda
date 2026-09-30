// Casos de falha contra o Google simulado: cancelamentos, execuções repetidas, configuração incompleta,
// falha ao gerar o PDF e erro no envio do alerta. Só dados inventados.
// Regra que vale em todos: o que sai no Registro e no e-mail nunca leva o texto do erro (que pode ter nome ou saúde).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio, CONFIG_COMPLETA, textoQuePodeVazar } = require('./apoio/fluxo.js');

const SENSIVEL = /diabetes|Maria Souza|Ana S\./;

const comConfig = (troca) => CONFIG_COMPLETA.map(([k, v]) => [k, k in troca ? troca[k] : v]);

function comPagamentoPago() {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  c.rodar('gerarAReceber()');
  const linha = c.linhaOnde('Pagamentos', 'codigo_paciente', 'P9001');
  c.selecionar('Pagamentos', linha);
  c.rodar('marcarPagoPix()');
  c.definir('Pagamentos', linha, 'pagador_nome', 'Maria Souza Teste');
  c.definir('Pagamentos', linha, 'pagador_cpf', '52998224725');
  return { c, linha };
}

// ---------- cancelamentos ----------

test('cancelamento: evento apagado da agenda vira cancelada; fora do período e realizada ficam como estão', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  const p9002 = c.linhas('Consultas').find((l) => l[4] === 'P9002'); // 14 dias atrás, marcada
  const p9003 = c.linhas('Consultas').find((l) => l[4] === 'P9003' && l[3] === 'primeira');
  c.selecionar('Consultas', c.linhaOnde('Consultas', 'id_evento', p9003[0]));
  c.rodar('marcarConsultaRealizada()');
  c.amb.abas.get('Consultas').linhas.push(['muitolonge', '2027-03-01', '09:00', 'primeira', 'P9001', 'marcada', '']); // depois de 90 dias
  c.amb.abas.get('Consultas').linhas.push(['muitoantiga', '2026-08-01', '09:00', 'primeira', 'P9001', 'marcada', '']); // antes de 30 dias

  for (const id of [p9002[0], p9003[0]]) { c.eventos.splice(c.eventos.findIndex((e) => e.id === id), 1); c.amb.apagados.add(id); }
  c.rodar('sincronizarAgenda()');
  const status = (id) => c.linhas('Consultas').find((l) => l[0] === id)[5];
  assert.equal(status(p9002[0]), 'cancelada');
  assert.equal(status(p9003[0]), 'realizada'); // já aconteceu: a agenda não desfaz
  assert.equal(status('muitolonge'), 'marcada');
  assert.equal(status('muitoantiga'), 'marcada');
});

test('cancelamento: agenda que volta vazia não cancela nada e avisa', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  c.eventos.length = 0;
  c.amb.alertas.length = 0;
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.equal(c.linhas('Consultas').filter((l) => l[5] === 'cancelada').length, 0);
  assert.match(c.ultimoAlerta(), /voltou sem nenhum evento/);
});

test('cancelamento: evento cancelado que volta à agenda NÃO reativa a consulta sozinho (D19), sem duplicar', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  const original = c.eventos[0];
  c.eventos[0] = { id: original.id, status: 'cancelled' };
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').find((l) => l[0] === original.id)[5], 'cancelada');
  c.eventos[0] = original;
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.equal(c.linhas('Consultas').find((l) => l[0] === original.id)[5], 'cancelada');
  assert.match(c.ultimoAlerta(), /ainda têm o evento na agenda e ficaram canceladas/);
  assert.equal(c.linhas('Consultas').length, 9);
});

test('cancelamento: consulta cancelada não gera cobrança nova e a já paga continua no relatório', () => {
  const { c } = comPagamentoPago();
  const p9001 = c.linhas('Consultas').find((l) => l[4] === 'P9001' && l[3] === 'primeira');
  c.eventos[c.eventos.findIndex((e) => e.id === p9001[0])] = { id: p9001[0], status: 'cancelled' };
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').find((l) => l[0] === p9001[0])[5], 'cancelada');
  c.rodar('gerarRelatorioDoMes()');
  const total = c.amb.abas.get('Relatório 2026-09').linhas.find((l) => l[0] === 'TOTAL');
  assert.equal(total[3], 'R$ 150,00'); // dinheiro que entrou não some porque a consulta foi cancelada
});

// ---------- execuções repetidas e travas ----------

test('trava ocupada: sincronizar, cobrar e recibo avisam em português, sem mudar nada e sem e-mail', () => {
  const { c, linha } = comPagamentoPago();
  const foto = JSON.stringify(['Consultas', 'Pagamentos'].map((a) => c.linhas(a)));
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  c.selecionar('Pagamentos', linha);
  for (const acao of ['sincronizarAgendaPeloMenu()', 'gerarAReceberPeloMenu()', 'gerarReciboDaLinhaSelecionada()', 'marcarPagoCartao()']) {
    c.amb.alertas.length = 0;
    c.rodar(acao);
    assert.match(c.ultimoAlerta(), /Outra (operação|sincronização) está em andamento/, acao);
  }
  assert.equal(JSON.stringify(['Consultas', 'Pagamentos'].map((a) => c.linhas(a))), foto);
  assert.equal(c.drive.pdfsNaPasta().length, 0);
  assert.equal(c.amb.emails.length, 0);
});

test('a trava é solta mesmo quando a operação falha (a próxima tentativa funciona)', () => {
  const c = criarConsultorio();
  let presa = false;
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => !presa && (presa = true), releaseLock() { presa = false; } }) };
  const calendarioOriginal = c.amb.contexto.Calendar;
  c.amb.contexto.Calendar = { Events: { list: () => { throw new Error('Google fora do ar'); } } };
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.equal(presa, false, 'a trava ficou presa depois do erro');
  c.amb.contexto.Calendar = calendarioOriginal;
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').length, 9);
});

test('erro do Google na agenda: nada é gravado pela metade, vai ao Registro e ao e-mail sem o texto do erro', () => {
  const c = criarConsultorio();
  c.amb.contexto.Calendar = { Events: { list: () => { throw new Error('Ana S. tem diabetes'); } } };
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.equal(c.linhas('Consultas').length, 0);
  assert.equal(c.amb.emails.length, 1);
  assert.doesNotMatch(textoQuePodeVazar(c), SENSIVEL);
});

// ---------- configuração incompleta ----------

test('configuração incompleta: cita a chave que falta, não grava nada e não manda e-mail (é problema de uso)', () => {
  const c = criarConsultorio({ configuracoes: comConfig({ chave_pix: '', nome_profissional: '' }) });
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.match(c.ultimoAlerta(), /"chave_pix"/);
  assert.match(c.ultimoAlerta(), /"nome_profissional"/);
  assert.equal(c.linhas('Consultas').length, 0);
  assert.equal(c.amb.emails.length, 0);
});

test('configuração incompleta: no gatilho automático a falha vai ao Registro e ao e-mail, sem o valor digitado', () => {
  const c = criarConsultorio({ configuracoes: comConfig({ chave_pix: '' }) });
  c.rodar('sincronizarAgendaAutomatica()');
  assert.match(c.registroTexto(), /configuração está em branco ou inválida/);
  assert.doesNotMatch(c.registroTexto(), /teste@exemplo/);
  assert.equal(c.amb.emails.length, 1);
  assert.equal(c.linhas('Consultas').length, 0);
  // M4: na hora seguinte a causa continua no Registro, mas o e-mail não se repete no mesmo dia
  c.rodar('sincronizarAgendaAutomatica()');
  assert.equal(c.amb.emails.length, 1);
});

test('preços em zero: nenhuma cobrança nasce, os dois avisos aparecem, e a consulta não é perdida', () => {
  const c = criarConsultorio({ configuracoes: comConfig({ valor_primeira_consulta_centavos: 0, valor_retorno_centavos: '' }) });
  c.rodar('sincronizarAgenda()');
  c.amb.alertas.length = 0;
  c.rodar('gerarAReceberPeloMenu()');
  assert.equal(c.linhas('Pagamentos').length, 0);
  assert.match(c.ultimoAlerta(), /primeira consulta não está configurado/);
  assert.match(c.ultimoAlerta(), /retorno não está configurado/);
  assert.equal(c.linhas('Consultas').length, 9);
});

test('preço em reais em vez de centavos ("150,00"): recusado, nunca vira cobrança', () => {
  const c = criarConsultorio({ configuracoes: comConfig({ valor_primeira_consulta_centavos: '150,00' }) });
  c.rodar('gerarAReceberPeloMenu()');
  assert.equal(c.linhas('Pagamentos').length, 0);
  assert.match(c.ultimoAlerta(), /valor_primeira_consulta_centavos/);
  assert.equal(c.amb.emails.length, 0);
});

test('recibo sem modelo ou sem pasta configurados: diz qual chave preencher e não gera nada', () => {
  const { c, linha } = comPagamentoPago();
  for (const chave of ['id_modelo_recibo', 'id_pasta_recibos']) {
    const cfg = c.amb.abas.get('Configurações').linhas.find((l) => l[0] === chave);
    const antigo = cfg[1];
    cfg[1] = '';
    c.selecionar('Pagamentos', linha);
    c.rodar('gerarReciboDaLinhaSelecionada()');
    assert.match(c.ultimoAlerta(), new RegExp(`"${chave}"`));
    cfg[1] = antigo;
  }
  assert.equal(c.drive.pdfsNaPasta().length, 0);
  assert.equal(c.amb.emails.length, 0);
});

test('recibo sem pagador, sem data ou com CPF inválido: lista o que falta, sem repetir o CPF', () => {
  const { c, linha } = comPagamentoPago();
  c.definir('Pagamentos', linha, 'pagador_nome', '');
  c.definir('Pagamentos', linha, 'data_pagamento', '');
  c.definir('Pagamentos', linha, 'pagador_cpf', '11111111111');
  c.selecionar('Pagamentos', linha);
  c.rodar('gerarReciboDaLinhaSelecionada()');
  assert.match(c.ultimoAlerta(), /pagador_nome/);
  assert.match(c.ultimoAlerta(), /data_pagamento/);
  assert.match(c.ultimoAlerta(), /CPF/);
  assert.doesNotMatch(c.ultimoAlerta(), /11111111111/);
  assert.equal(c.drive.pdfsNaPasta().length, 0);
});

test('relatório sem pasta configurada: a aba sai, o CSV não, com aviso claro', () => {
  const { c } = comPagamentoPago();
  c.amb.abas.get('Configurações').linhas.find((l) => l[0] === 'id_pasta_recibos')[1] = '';
  c.rodar('gerarRelatorioDoMes()');
  assert.ok(c.amb.abas.get('Relatório 2026-09'));
  assert.match(c.ultimoAlerta(), /CSV não salvo/);
  assert.equal(c.drive.csvsNaPasta().length, 0);
});

test('aba apagada ou planilha sem instalar: mensagem em português, sem e-mail e sem quebrar', () => {
  const c = criarConsultorio();
  c.amb.abas.delete('Pagamentos');
  c.selecionar('Pagamentos', 2);
  c.rodar('gerarAReceberPeloMenu()');
  assert.match(c.ultimoAlerta(), /aba "Pagamentos" não existe/);
  c.amb.abas.delete('Configurações');
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.match(c.ultimoAlerta(), /aba "Configurações" não existe/);
  assert.equal(c.amb.emails.length, 0);
});

test('linhas selecionadas demais ou vazias não fazem nada', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  c.rodar('gerarAReceber()');
  c.selecionar('Pagamentos', ...Array.from({ length: 21 }, (_, i) => i + 2));
  c.rodar('marcarPagoPix()');
  assert.match(c.ultimoAlerta(), /no máximo 20/);
  assert.ok(c.linhas('Pagamentos').every((l) => l[7] === 'a_receber'));
  c.selecionar('Pagamentos', 50);
  c.rodar('marcarPagoPix()');
  assert.match(c.ultimoAlerta(), /está vazia/);
});

// ---------- falha ao gerar o PDF ----------

for (const [falha, descricao] of [['exportarPdf', 'exportar o PDF'], ['copiar', 'copiar o modelo (arquivo não encontrado)'], ['criarArquivo', 'salvar na pasta'], ['abrirDocumento', 'abrir o documento']]) {
  test(`falha ao ${descricao}: sem recibo pela metade, cópia na lixeira, alerta sem o texto do erro, e a nova tentativa funciona`, () => {
    const { c, linha } = comPagamentoPago();
    c.drive.falhas[falha] = true;
    c.selecionar('Pagamentos', linha);
    c.rodar('gerarReciboDaLinhaSelecionada()');

    assert.equal(c.celula('Pagamentos', linha, 'link_recibo'), '', 'gravou link de um recibo que não existe');
    assert.equal(c.drive.pdfsNaPasta().length, 0);
    assert.ok([...c.drive.arquivos.values()].filter((a) => a.nome.startsWith('rascunho-')).every((a) => a.lixeira), 'sobrou cópia de trabalho fora da lixeira');
    assert.equal(c.amb.emails.length, 1);
    assert.match(c.registroTexto(), /Falha no módulo recibo/);
    assert.doesNotMatch(textoQuePodeVazar(c), SENSIVEL);
    assert.match(c.ultimoAlerta(), /Não foi possível concluir/);

    c.drive.falhas[falha] = false; // o Google voltou
    c.rodar('gerarReciboDaLinhaSelecionada()');
    assert.equal(c.drive.pdfsNaPasta().length, 1);
    assert.match(c.celula('Pagamentos', linha, 'link_recibo'), /^https:/);
  });
}

test('falha ao gerar o recibo de uma linha não afeta o relatório nem o pagamento', () => {
  const { c, linha } = comPagamentoPago();
  c.drive.falhas.exportarPdf = true;
  c.selecionar('Pagamentos', linha);
  c.rodar('gerarReciboDaLinhaSelecionada()');
  assert.equal(c.celula('Pagamentos', linha, 'status'), 'pago');
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(c.amb.abas.get('Relatório 2026-09').linhas.find((l) => l[0] === 'TOTAL')[3], 'R$ 150,00');
});

test('falha ao salvar o CSV do relatório: erro registrado, sem texto do erro, e a aba já feita continua lá', () => {
  const { c } = comPagamentoPago();
  c.drive.falhas.criarArquivo = true;
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(c.amb.emails.length, 1);
  assert.match(c.registroTexto(), /Falha no módulo relatorio/);
  assert.doesNotMatch(textoQuePodeVazar(c), SENSIVEL);
  c.drive.falhas.criarArquivo = false;
  c.rodar('gerarRelatorioDoMes()');
  assert.equal(c.drive.csvsNaPasta().length, 1);
  assert.equal(c.amb.abas.get('Relatório 2026-09').linhas.filter((l) => l[0] === 'TOTAL').length, 1);
});

// ---------- erro no envio do alerta ----------

test('e-mail de alerta falha (cota ou bloqueio): o erro original fica no Registro, o aviso também, e nada quebra', () => {
  const c = criarConsultorio();
  c.amb.contexto.MailApp = { sendEmail: () => { throw new Error('Limite diário de e-mails: alerta@exemplo.invalid Maria Souza'); } };
  c.amb.contexto.Calendar = { Events: { list: () => { throw new Error('Ana S. tem diabetes'); } } };
  c.rodar('sincronizarAgendaPeloMenu()');
  const registro = c.registroTexto();
  assert.match(registro, /Falha no módulo sincronizacao/);
  assert.match(registro, /E-mail de alerta não enviado \(tipo Error\)/);
  assert.doesNotMatch(registro, SENSIVEL);
  assert.doesNotMatch(registro, /alerta@|Limite diário/);
  assert.match(c.ultimoAlerta(), /Não foi possível concluir/); // a nutricionista ainda vê o problema na tela
});

test('e-mail de alerta falha no gatilho automático: nenhum erro escapa do gatilho', () => {
  const c = criarConsultorio();
  c.amb.contexto.MailApp = { sendEmail: () => { throw new Error('cota'); } };
  c.amb.contexto.Calendar = { Events: { list: () => { throw new Error('fora do ar'); } } };
  assert.doesNotThrow(() => c.rodar('sincronizarAgendaAutomatica()'));
  assert.match(c.registroTexto(), /não enviado/);
});

test('alerta com e-mail em branco ou inválido e aba Registro apagada: só o Logger, sem exceção', () => {
  const c = criarConsultorio({ configuracoes: comConfig({ email_alertas: 'sem-arroba' }) });
  c.amb.abas.delete('Registro');
  const logs = [];
  c.amb.contexto.Logger = { log: (t) => logs.push(t) };
  assert.doesNotThrow(() => c.rodar('testarAlertaDeFalha()'));
  assert.equal(c.amb.emails.length, 0);
  assert.ok(logs.length >= 1);
  assert.doesNotMatch(logs.join('\n'), /sem-arroba|Erro de teste forçado/);
});

test('o teste de alerta do menu informa na tela quando o e-mail não saiu', () => {
  const c = criarConsultorio();
  c.amb.contexto.MailApp = { sendEmail: () => { throw new Error('cota'); } };
  c.rodar('testarAlertaDeFalha()');
  assert.match(c.ultimoAlerta(), /Registrado na aba Registro: sim/);
  assert.match(c.ultimoAlerta(), /E-mail de alerta enviado: NÃO/);
});
