// Preços das consultas em reais (chamadas ao Google). Decisão D17: ela digita R$ 150,00 e o kit grava 15000 centavos.
// A conversão e as recusas estão em Formatos.js (lerReais); a aba Configurações continua guardando centavos inteiros.

const PRECO_QUE_PEDE_CONFIRMACAO_CENTAVOS = 1000; // abaixo de R$ 10,00 ela confirma antes de valer

// Pergunta um preço em reais. Devolve os centavos, ou null se ela cancelou ou deixou em branco (mantém o atual).
function perguntarPreco_(ui, titulo, chave, atualCentavos) {
  const atual = Number.isSafeInteger(atualCentavos) && atualCentavos > 0 ? `Preço atual: ${formatarReais(atualCentavos)}. ` : 'Ainda sem preço. ';
  const resposta = ui.prompt(titulo, `${atual}Digite o novo valor em reais (por exemplo 150,00). Deixe em branco para não mudar.`, ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return null;
  const texto = resposta.getResponseText();
  if (String(texto).trim() === '') return null;
  const lido = lerReais(texto);
  if (!lido.ok) throw erroDeUso_(`${lido.motivo} Nada foi gravado.`);
  if (lido.centavos < PRECO_QUE_PEDE_CONFIRMACAO_CENTAVOS) {
    const ok = ui.alert('Confirmar valor', `O valor ficou em ${formatarReais(lido.centavos)}. É isso mesmo? (Para R$ 150,00, digite 150 ou 150,00.)`, ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return null;
  }
  return lido.centavos;
}

// Item do menu: Configuração > Definir preços das consultas.
function definirPrecosDasConsultas() {
  executarNoMenu_('configuracoes', () => comTrava_(() => {
    const ui = SpreadsheetApp.getUi();
    const atual = validarConfiguracoes(lerLinhasConfiguracoes_()).config;
    const primeira = perguntarPreco_(ui, 'Preço da primeira consulta', 'valor_primeira_consulta_centavos', atual.valor_primeira_consulta_centavos);
    const retorno = perguntarPreco_(ui, 'Preço do retorno', 'valor_retorno_centavos', atual.valor_retorno_centavos);
    const feito = [];
    if (primeira !== null) { atualizarConfiguracao_('valor_primeira_consulta_centavos', primeira); feito.push(`primeira consulta ${formatarReais(primeira)}`); }
    if (retorno !== null) { atualizarConfiguracao_('valor_retorno_centavos', retorno); feito.push(`retorno ${formatarReais(retorno)}`); }
    ui.alert('Preços', feito.length > 0 ? `Gravado: ${feito.join(' e ')}. A aba Configurações guarda em centavos.` : 'Nenhum preço foi mudado.', ui.ButtonSet.OK);
  }));
}

// Antes de gerar cobranças: preço abaixo de R$ 10,00 é quase sempre reais digitados no campo de centavos (150 = R$ 1,50).
// Devolve a mensagem de confirmação, ou '' se os preços estão normais.
function textoPrecoSuspeito(config) {
  const suspeitos = [];
  for (const [chave, nome] of [['valor_primeira_consulta_centavos', 'da primeira consulta'], ['valor_retorno_centavos', 'do retorno']]) {
    const v = config[chave];
    if (Number.isSafeInteger(v) && v > 0 && v < PRECO_QUE_PEDE_CONFIRMACAO_CENTAVOS) suspeitos.push(`${nome}: ${formatarReais(v)}`);
  }
  return suspeitos.length === 0 ? ''
    : `Preço muito baixo (${suspeitos.join('; ')}). A aba Configurações guarda centavos: R$ 150,00 seria 15000. `
      + 'Use Configuração > Definir preços das consultas para digitar em reais. Gerar as cobranças assim mesmo?';
}

if (typeof module !== 'undefined') {
  module.exports = { textoPrecoSuspeito, PRECO_QUE_PEDE_CONFIRMACAO_CENTAVOS };
}
