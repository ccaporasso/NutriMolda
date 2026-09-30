// Leitura da aba Configurações (chamada ao Google). A validação está em Configuracoes.js.

// `estrito` (padrão): confere nome, ordem e largura do cabeçalho antes de ler (R07). Só o aviso de falha lê sem essa conferência,
// porque precisa achar o e-mail justamente quando algo está errado.
function lerLinhasConfiguracoes_(estrito = true) {
  const folha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configurações');
  if (!folha) {
    throw Object.assign(new Error('A aba "Configurações" não existe. Use o menu Kit do Consultório > Instalar/atualizar planilha.'), { name: 'ErroDeUso' });
  }
  if (estrito) abrirFolhaConferida_('Configurações');
  const ultima = folha.getLastRow();
  return ultima > 1 ? folha.getRange(2, 1, ultima - 1, 2).getValues() : [];
}

// Só o e-mail de alertas, sem exigir que o resto das Configurações esteja certo:
// o aviso de falha precisa funcionar justamente quando algo está errado.
// Devolve o e-mail ou null se estiver ausente ou inválido.
function lerEmailAlertas() {
  return validarConfiguracoes(lerLinhasConfiguracoes_(false)).config.email_alertas || null;
}

// Devolve { config, avisos }. Se houver erro, interrompe com a lista completa em português.
function lerConfiguracoes() {
  const resultado = validarConfiguracoes(lerLinhasConfiguracoes_());
  if (resultado.erros.length > 0) throw Object.assign(new Error(montarMensagemErros(resultado)), { name: 'ErroDeUso' });
  return { config: resultado.config, avisos: resultado.avisos };
}
