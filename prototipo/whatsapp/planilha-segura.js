'use strict';
// B1 (caso 12): preparo de valores para um FUTURO adaptador de planilha. Texto que começa com = + - @
// (ou com tab/retorno de linha) viraria fórmula no Planilhas/Excel; um apóstrofo-espaço na frente evita.
// Ainda não há adaptador de planilha no protótipo: isto só fixa o contrato e o teste.
const PERIGOSO = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/;

function neutralizarCelula(valor) {
  if (typeof valor !== 'string') return valor;
  return PERIGOSO.test(valor) ? ` ${valor}` : valor;
}
const neutralizarLinha = (linha) => linha.map(neutralizarCelula);

module.exports = { neutralizarCelula, neutralizarLinha };
