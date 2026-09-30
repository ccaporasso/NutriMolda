// Gera os valores a receber a partir das consultas (chamadas ao Google). A lógica está em Pagamentos.js.
// Sem janelas: pode rodar também por gatilho ou por outras funções.

function gerarAReceber() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw erroDeUso_('Outra operação está em andamento. Tente de novo em um minuto.');
  try {
    const config = lerConfiguracoes().config;
    const plano = planejarAReceber({
      consultas: lerAbaComoObjetos('Consultas'),
      pagamentos: lerAbaComoObjetos('Pagamentos'),
      config,
    });
    adicionarLinhas('Pagamentos', plano.novos.map(linhaPagamento));
    registrar('pagamentos', 'info', `A receber: ${plano.novos.length} nova(s) cobrança(s).`);
    return plano;
  } finally {
    trava.releaseLock();
  }
}

// Item do menu.
function gerarAReceberPeloMenu() {
  executarNoMenu_('pagamentos', () => {
    const plano = gerarAReceber();
    SpreadsheetApp.getUi().alert('Valores a receber', resumirAReceber(plano), SpreadsheetApp.getUi().ButtonSet.OK);
  });
}
