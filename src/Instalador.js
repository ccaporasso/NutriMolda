// Instalador da planilha (chamadas ao Google). Idempotente: pode rodar várias vezes.
// A lógica de decisão está em Esquema.js.

const DESCRICAO_PROTECAO = 'Kit do Consultório: cabeçalho';

// Item do menu: erro inesperado vai ao Registro e ao e-mail, com mensagem clara na tela (B6).
function instalarPlanilha() {
  executarNoMenu_('instalador', instalarPlanilha_);
}

// Fuso do kit (D13). As datas digitadas em células de data (Pacotes.inicio, Despesas.data) são lidas no fuso de
// São Paulo; se a planilha estiver em outro fuso, a data volta um dia (B2). Ajusta uma vez; devolve true se ajustou.
function ajustarFusoDaPlanilha_(planilha) {
  if (planilha.getSpreadsheetTimeZone() === 'America/Sao_Paulo') return false;
  planilha.setSpreadsheetTimeZone('America/Sao_Paulo');
  return true;
}

function instalarPlanilha_() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const plano = planejarInstalacao(lerEstadoAtual_(planilha));
  const fusoAjustado = ajustarFusoDaPlanilha_(planilha);

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

  const resumo = `Abas criadas: ${plano.criarAbas.length}. Chaves de configuração novas: ${plano.chavesNovas.length}.`
    + (fusoAjustado ? ' O fuso horário da planilha foi ajustado para São Paulo.' : '');
  SpreadsheetApp.getUi().alert([resumo].concat(plano.avisos).join('\n'));
}

function lerEstadoAtual_(planilha) {
  const estado = {};
  for (const aba of ABAS) {
    const folha = planilha.getSheetByName(aba.nome);
    if (!folha) continue;
    const largura = aba.cabecalho.length;
    estado[aba.nome] = {
      cabecalho: folha.getRange(1, 1, 1, Math.min(Math.max(largura, typeof folha.getLastColumn === 'function' ? folha.getLastColumn() : 0), folha.getMaxColumns())).getValues()[0],
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
