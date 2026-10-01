// Leitura de abas como objetos (chamadas ao Google). Usa os cabeçalhos de Esquema.js.
// Datas que o Planilhas converteu voltam para texto no fuso de São Paulo; números em texto viram número.

const COLUNAS_INTEIRAS = ['valor_centavos', 'total_consultas', 'usadas'];

function converterCelula_(coluna, valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    const formato = coluna === 'hora' ? 'HH:mm' : (coluna === 'atualizado_em' || coluna === 'data_hora' ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
    return Utilities.formatDate(valor, FUSO_KIT, formato);
  }
  if (COLUNAS_INTEIRAS.includes(coluna) && typeof valor === 'string' && /^\d+$/.test(valor.trim())) return Number(valor.trim());
  return valor === undefined || valor === null ? '' : valor;
}

// Abre a aba do esquema e confere o cabeçalho antes de qualquer leitura ou gravação (R07).
function abrirFolhaConferida_(nomeAba) {
  const aba = ABAS.find((a) => a.nome === nomeAba);
  const folha = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
  if (!aba || !folha) throw erroDeUso_(`A aba "${nomeAba}" não existe. Use o menu Kit do Consultório > Instalar/atualizar planilha.`);
  const largura = Math.max(aba.cabecalho.length, typeof folha.getLastColumn === 'function' ? folha.getLastColumn() : 0);
  const lido = folha.getLastRow() >= 1 ? folha.getRange(1, 1, 1, largura).getValues()[0] : [];
  const problema = divergenciaDeCabecalho(aba, lido);
  if (problema) throw erroDeUso_(problema);
  return { aba, folha };
}

// Devolve [{ linha, <coluna>: valor, ... }] sem as linhas totalmente vazias.
function lerAbaComoObjetos(nomeAba) {
  const { aba, folha } = abrirFolhaConferida_(nomeAba);
  if (folha.getLastRow() < 2) return [];
  const valores = folha.getRange(2, 1, folha.getLastRow() - 1, aba.cabecalho.length).getValues();
  const objetos = [];
  valores.forEach((linha, i) => {
    if (linha.every((v) => v === '' || v === null)) return;
    const o = { linha: i + 2 };
    aba.cabecalho.forEach((coluna, j) => { o[coluna] = converterCelula_(coluna, linha[j]); });
    objetos.push(o);
  });
  return objetos;
}

// Texto escrito pelo kit nunca vira fórmula, mesmo que a célula não esteja em formato texto (proteção central, Formatos.js).
function valorSeguro_(valor) {
  return typeof valor === 'string' ? neutralizarFormula(valor) : valor;
}

function adicionarLinhas(nomeAba, linhas) {
  if (linhas.length === 0) return;
  const { aba, folha } = abrirFolhaConferida_(nomeAba);
  garantirEspacoNaFolha_(folha, aba, linhas.length);
  folha.getRange(folha.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas.map((l) => l.map(valorSeguro_)));
}

// A grade do Planilhas tem tamanho fixo (1000 linhas numa aba nova): gravar além dela falha. Aumenta a grade antes de
// gravar e refaz o formato texto e as listas nas linhas novas (M3).
function garantirEspacoNaFolha_(folha, aba, quantas) {
  const faltam = folha.getLastRow() + quantas - folha.getMaxRows();
  if (faltam <= 0) return;
  const antes = folha.getMaxRows();
  const acrescentar = faltam + 500;
  folha.insertRowsAfter(antes, acrescentar);
  for (const coluna of colunasDeTexto(aba)) folha.getRange(antes + 1, coluna, acrescentar, 1).setNumberFormat('@');
  aplicarValidacoes_(folha, aba);
}

// Logo antes de gravar por número de linha, confere que a linha ainda é a mesma que foi lida (B1): enquanto o kit
// trabalha, ela pode ter ordenado, apagado ou inserido linhas. `esperado` = { coluna: valor lido antes }.
function conferirLinha_(aba, folha, numeroLinha, esperado) {
  const lido = folha.getRange(numeroLinha, 1, 1, aba.cabecalho.length).getValues()[0];
  for (const [coluna, valor] of Object.entries(esperado || {})) {
    const atual = converterCelula_(coluna, lido[aba.cabecalho.indexOf(coluna)]);
    if (String(atual) !== String(valor === undefined || valor === null ? '' : valor)) {
      throw erroDeUso_(`A linha ${numeroLinha} da aba "${aba.nome}" mudou enquanto o kit trabalhava (linhas ordenadas, apagadas ou inseridas?). `
        + 'Nada foi gravado nela. Confira e tente de novo.');
    }
  }
}

// A primeira coluna (id, id_evento, codigo) é a chave: por padrão, ela precisa ser a mesma que vai ser regravada.
function gravarLinha(nomeAba, numeroLinha, valores, esperado) {
  const { aba, folha } = abrirFolhaConferida_(nomeAba);
  conferirLinha_(aba, folha, numeroLinha, esperado || { [aba.cabecalho[0]]: valores[0] });
  folha.getRange(numeroLinha, 1, 1, valores.length).setValues([valores.map(valorSeguro_)]);
}

// `esperado`: colunas que identificam a linha, com os valores lidos antes (obrigatório: sem ele não há como conferir).
function gravarCelula(nomeAba, numeroLinha, nomeColuna, valor, esperado) {
  const { aba, folha } = abrirFolhaConferida_(nomeAba);
  conferirLinha_(aba, folha, numeroLinha, esperado);
  folha.getRange(numeroLinha, aba.cabecalho.indexOf(nomeColuna) + 1, 1, 1).setValues([[valorSeguro_(valor)]]);
}

// Números das linhas selecionadas na aba indicada (nunca o cabeçalho). Pede a aba certa se ela estiver em outra.
function linhasSelecionadas(nomeAba, maximo) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const folha = planilha.getActiveSheet();
  if (!folha || folha.getName() !== nomeAba) {
    throw erroDeUso_(`Abra a aba "${nomeAba}" e clique na linha desejada antes de usar este item do menu.`);
  }
  const faixa = planilha.getActiveRange();
  const linhas = [];
  for (let i = 0; i < faixa.getNumRows(); i++) if (faixa.getRow() + i >= 2) linhas.push(faixa.getRow() + i);
  if (linhas.length === 0) throw erroDeUso_(`Clique em uma linha de dados da aba "${nomeAba}" (não no cabeçalho).`);
  if (linhas.length > maximo) throw erroDeUso_(`Selecione no máximo ${maximo} linha(s) por vez.`);
  return linhas;
}
