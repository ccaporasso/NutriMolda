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
  const lido = folha.getLastRow() >= 1 ? folha.getRange(1, 1, 1, aba.cabecalho.length).getValues()[0] : [];
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

function adicionarLinhas(nomeAba, linhas) {
  if (linhas.length === 0) return;
  const { folha } = abrirFolhaConferida_(nomeAba);
  folha.getRange(folha.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
}

function gravarLinha(nomeAba, numeroLinha, valores) {
  const { folha } = abrirFolhaConferida_(nomeAba);
  folha.getRange(numeroLinha, 1, 1, valores.length).setValues([valores]);
}

function gravarCelula(nomeAba, numeroLinha, nomeColuna, valor) {
  const { aba, folha } = abrirFolhaConferida_(nomeAba);
  folha.getRange(numeroLinha, aba.cabecalho.indexOf(nomeColuna) + 1, 1, 1).setValues([[valor]]);
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
