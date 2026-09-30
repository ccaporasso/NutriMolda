// Leitura da aba Configurações (chamada ao Google). A validação está em Configuracoes.js.

function lerLinhasConfiguracoes_() {
  const folha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configurações');
  if (!folha) {
    throw Object.assign(new Error('A aba "Configurações" não existe. Use o menu Kit do Consultório > Instalar/atualizar planilha.'), { name: 'ErroDeUso' });
  }
  const ultima = folha.getLastRow();
  return ultima > 1 ? folha.getRange(2, 1, ultima - 1, 2).getValues() : [];
}

// Só o e-mail de alertas, sem exigir que o resto das Configurações esteja certo:
// o aviso de falha precisa funcionar justamente quando algo está errado.
// Devolve o e-mail ou null se estiver ausente ou inválido.
function lerEmailAlertas() {
  return validarConfiguracoes(lerLinhasConfiguracoes_()).config.email_alertas || null;
}

// Devolve { config, avisos }. Se houver erro, interrompe com a lista completa em português.
function lerConfiguracoes() {
  const resultado = validarConfiguracoes(lerLinhasConfiguracoes_());
  if (resultado.erros.length > 0) throw Object.assign(new Error(montarMensagemErros(resultado)), { name: 'ErroDeUso' });
  return { config: resultado.config, avisos: resultado.avisos };
}
