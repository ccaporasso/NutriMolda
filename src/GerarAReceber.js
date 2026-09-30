// Gera os valores a receber a partir das consultas (chamadas ao Google). A lógica está em Pagamentos.js.
// Sem janelas: pode rodar também por gatilho ou por outras funções.

// `primeirasAprovadas`: ids de evento que ela confirmou como primeira consulta mesmo com consulta anterior (A1).
function gerarAReceber(primeirasAprovadas = []) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw erroDeUso_('Outra operação está em andamento. Tente de novo em um minuto.');
  try {
    const config = lerConfiguracoes().config;
    const plano = planejarAReceber({
      consultas: lerAbaComoObjetos('Consultas'),
      pagamentos: lerAbaComoObjetos('Pagamentos'),
      config,
      primeirasAprovadas,
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
    const ui = SpreadsheetApp.getUi();
    const config = lerConfiguracoes().config;
    const aviso = textoPrecoSuspeito(config);
    if (aviso && ui.alert('Conferir o preço', aviso, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    // A1: "primeira" de quem já tem consulta anterior só é cobrada como primeira se ela confirmar (senão, fica para ela corrigir o tipo).
    const previa = planejarAReceber({ consultas: lerAbaComoObjetos('Consultas'), pagamentos: lerAbaComoObjetos('Pagamentos'), config });
    let aprovadas = [];
    if (previa.idsPrimeiraComHistorico.length > 0) {
      const linhas = previa.linhasPrimeiraComHistorico.filter((n) => n !== undefined).join(', ');
      const resposta = ui.alert('Primeira consulta ou retorno?',
        `${previa.idsPrimeiraComHistorico.length} consulta(s) estão como "primeira", mas o paciente já tem consulta anterior (linha(s) ${linhas} da aba Consultas). `
        + 'Sim: cobrar com o preço da primeira consulta (por exemplo, faltou na primeira ou voltou depois de muito tempo). '
        + 'Não: não cobrar agora; troque o "tipo" para retorno e gere de novo.', ui.ButtonSet.YES_NO);
      if (resposta === ui.Button.YES) aprovadas = previa.idsPrimeiraComHistorico;
    }
    const plano = gerarAReceber(aprovadas);
    SpreadsheetApp.getUi().alert('Valores a receber', resumirAReceber(plano), SpreadsheetApp.getUi().ButtonSet.OK);
  });
}
