// Leitura da aba Configurações (chamada ao Google). A validação está em Configuracoes.js.

// Devolve { config, avisos }. Se houver erro, interrompe com a lista completa em português.
function lerConfiguracoes() {
  const folha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configurações');
  if (!folha) {
    throw new Error('A aba "Configurações" não existe. Use o menu Kit do Consultório > Instalar/atualizar planilha.');
  }
  const ultima = folha.getLastRow();
  const linhas = ultima > 1 ? folha.getRange(2, 1, ultima - 1, 2).getValues() : [];
  const resultado = validarConfiguracoes(linhas);
  if (resultado.erros.length > 0) throw new Error(montarMensagemErros(resultado));
  return { config: resultado.config, avisos: resultado.avisos };
}
