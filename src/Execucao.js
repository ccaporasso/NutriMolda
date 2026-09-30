// Execução de itens de menu (chamadas ao Google).
// Problema de uso (algo que ela mesma corrige: campo em branco, aba errada) é um ErroDeUso:
// aparece na tela e não gera e-mail de alerta. Qualquer outro erro vai para o Registro e para o e-mail.

function erroDeUso_(mensagem) {
  return Object.assign(new Error(mensagem), { name: 'ErroDeUso' });
}

function executarNoMenu_(modulo, funcao) {
  try {
    return funcao();
  } catch (e) {
    if (!e || e.name !== 'ErroDeUso') registrarErro(modulo, e);
    SpreadsheetApp.getUi().alert('Não foi possível concluir', String(e && e.message ? e.message : 'Erro inesperado.'), SpreadsheetApp.getUi().ButtonSet.OK);
    return null;
  }
}
