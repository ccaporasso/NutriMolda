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

// Itens de menu que precisam deixar o erro seguir (os do gerador de TESTE, cujas recusas os testes conferem pela exceção):
// erro inesperado vai ao Registro e ao e-mail (fluxo 7) e depois segue adiante; problema de uso não gera e-mail (B6).
// O registro nunca esconde o erro original.
function comRegistroDeFalha_(modulo, funcao) {
  try {
    return funcao();
  } catch (e) {
    if (!e || e.name !== 'ErroDeUso') {
      try { registrarErro(modulo, e); } catch (falhaDoRegistro) { /* segue com o erro original */ }
    }
    throw e;
  }
}

// Trava para operações que gravam na planilha: duas ao mesmo tempo (menu e gatilho) não se atropelam.
function comTrava_(funcao) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw erroDeUso_('Outra operação está em andamento. Tente de novo em um minuto.');
  try {
    return funcao();
  } finally {
    trava.releaseLock();
  }
}
