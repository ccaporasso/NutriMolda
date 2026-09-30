// Instalador da planilha (chamadas ao Google). Idempotente: pode rodar várias vezes.
// A lógica de decisão está em Esquema.js.

const DESCRICAO_PROTECAO = 'Kit do Consultório: cabeçalho';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kit do Consultório')
    .addItem('Instalar/atualizar planilha', 'instalarPlanilha')
    .addItem('Sincronizar agenda', 'sincronizarAgendaPeloMenu')
    .addItem('Ativar sincronização automática', 'ativarSincronizacaoAutomatica')
    .addItem('Gerar recibo da linha selecionada (aba Pagamentos)', 'gerarReciboDaLinhaSelecionada')
    .addItem('Testar alerta de falha', 'testarAlertaDeFalha')
    .addSeparator()
    .addItem('TESTE: criar dados fictícios', 'criarDadosDeTeste')
    .addItem('TESTE: apagar dados fictícios', 'apagarDadosDeTeste')
    .addToUi();
}

function instalarPlanilha() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const plano = planejarInstalacao(lerEstadoAtual_(planilha));

  for (const nome of plano.criarAbas) planilha.insertSheet(nome);
  for (const aba of ABAS) {
    const folha = planilha.getSheetByName(aba.nome);
    if (plano.escreverCabecalho.includes(aba.nome)) {
      folha.getRange(1, 1, 1, aba.cabecalho.length).setValues([aba.cabecalho]);
    }
    if (!plano.avisos.some((a) => a.includes(`"${aba.nome}"`))) {
      folha.setFrozenRows(1);
      folha.getRange(1, 1, 1, aba.cabecalho.length).setFontWeight('bold');
      aplicarValidacoes_(folha, aba);
      for (const coluna of colunasDeTexto(aba)) {
        folha.getRange(1, coluna, folha.getMaxRows(), 1).setNumberFormat('@');
      }
      protegerCabecalho_(folha, aba);
    }
  }
  if (plano.chavesNovas.length > 0) {
    const folha = planilha.getSheetByName('Configurações');
    folha.getRange(folha.getLastRow() + 1, 1, plano.chavesNovas.length, 2).setValues(plano.chavesNovas);
  }
  // Remove a aba padrão vazia criada pelo Google, se sobrou.
  const padrao = planilha.getSheets().find((f) => /^(Página ?1|Sheet ?1|Hoja ?1)$/.test(f.getName()));
  if (padrao && planilha.getSheets().length > 1 && padrao.getLastRow() === 0) planilha.deleteSheet(padrao);

  const resumo = `Abas criadas: ${plano.criarAbas.length}. Chaves de configuração novas: ${plano.chavesNovas.length}.`;
  SpreadsheetApp.getUi().alert([resumo].concat(plano.avisos).join('\n'));
}

function lerEstadoAtual_(planilha) {
  const estado = {};
  for (const aba of ABAS) {
    const folha = planilha.getSheetByName(aba.nome);
    if (!folha) continue;
    const largura = aba.cabecalho.length;
    estado[aba.nome] = {
      cabecalho: folha.getRange(1, 1, 1, Math.min(largura, folha.getMaxColumns())).getValues()[0],
      chaves: aba.nome === 'Configurações' && folha.getLastRow() > 1
        ? folha.getRange(2, 1, folha.getLastRow() - 1, 1).getValues().map((l) => String(l[0]))
        : [],
    };
  }
  return estado;
}

function aplicarValidacoes_(folha, aba) {
  const linhas = Math.max(folha.getMaxRows() - 1, 1);
  for (const { coluna, valores } of colunasComValidacao(aba)) {
    const regra = SpreadsheetApp.newDataValidation()
      .requireValueInList(valores, true)
      .setAllowInvalid(false)
      .build();
    folha.getRange(2, coluna, linhas, 1).setDataValidation(regra);
  }
}

// Modo aviso: pede confirmação ao editar, mas nunca tranca a nutricionista.
function protegerCabecalho_(folha, aba) {
  const jaProtegido = folha.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .some((p) => p.getDescription() === DESCRICAO_PROTECAO);
  if (jaProtegido) return;
  folha.getRange(1, 1, 1, aba.cabecalho.length)
    .protect()
    .setDescription(DESCRICAO_PROTECAO)
    .setWarningOnly(true);
}
