// Relatório mensal (chamadas ao Google). A lógica está em Relatorio.js.
// Escreve a aba "Relatório AAAA-MM" (refeita a cada vez) e salva o CSV na pasta dos recibos (drive.file).

function gerarRelatorioMensal(mes) {
  const config = lerConfiguracoes().config;
  const resultado = consolidarRecebimentos(lerAbaComoObjetos('Pagamentos'), mes);
  const planilha = SpreadsheetApp.getActiveSpreadsheet();

  const nomeAba = nomeAbaRelatorio(mes);
  let folha = planilha.getSheetByName(nomeAba);
  if (folha) folha.clear(); else folha = planilha.insertSheet(nomeAba);
  const linhas = linhasAbaRelatorio(resultado);
  folha.getRange(1, 1, linhas.length, linhas[0].length).setNumberFormat('@').setValues(linhas);

  let csvSalvo = false;
  if (config.id_pasta_recibos) {
    const idPasta = validarIdDrive_(config.id_pasta_recibos, 'id_pasta_recibos');
    const nome = nomeArquivoRelatorio(mes);
    const blob = Utilities.newBlob(montarCsvRelatorio(resultado), 'text/csv', nome);
    const existente = driveAcharNaPasta(idPasta, nome);
    if (existente) driveSubstituirConteudo(existente, blob);
    else driveCriarArquivo(idPasta, nome, 'text/csv', blob);
    csvSalvo = true;
  } else {
    resultado.avisos.push('O CSV não foi salvo: "id_pasta_recibos" está em branco (use "Criar modelo e pasta de recibos").');
  }
  registrar('relatorio', 'info', `Relatório ${mes}: ${resultado.pagadores.length} pagador(es), ${resultado.quantidade} recebimento(s).`);
  return { resultado, csvSalvo, nomeAba };
}

// Item do menu: pergunta o mês (vazio = mês atual).
function gerarRelatorioDoMes() {
  executarNoMenu_('relatorio', () => {
    const ui = SpreadsheetApp.getUi();
    const resposta = ui.prompt('Relatório do mês', 'Mês no formato AAAA-MM (deixe em branco para o mês atual):', ui.ButtonSet.OK_CANCEL);
    if (resposta.getSelectedButton() !== ui.Button.OK) return;
    const mes = interpretarMes(resposta.getResponseText(), hojeSaoPaulo_());
    if (!mes) throw erroDeUso_('Mês inválido. Use AAAA-MM, por exemplo 2026-09.');
    const { resultado, csvSalvo, nomeAba } = gerarRelatorioMensal(mes);
    ui.alert('Relatório pronto', [
      `Aba "${nomeAba}": ${resultado.pagadores.length} pagador(es), ${resultado.quantidade} recebimento(s), total ${formatarReais(resultado.totalCentavos)}.`,
      csvSalvo ? `CSV salvo na pasta dos recibos (${nomeArquivoRelatorio(mes)}).` : 'CSV não salvo (veja o aviso na aba).',
    ].concat(resultado.avisos).join('\n'), ui.ButtonSet.OK);
  });
}
