// Relatório mensal do carnê-leão (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, fluxo 6: recebimentos do mês por pagador, em aba e em CSV para o contador.
// Conta só pagamento `pago` em Pix, cartão, dinheiro ou sem forma informada. Cortesia e consulta de pacote
// (valor zero, já contada na venda do pacote) ficam de fora e aparecem em contagem à parte.
// O CSV leva nome e CPF do pagador (o contador precisa), mas o NOME DO ARQUIVO leva só o mês.

const FORMAS_RECEBIMENTO = ['pix', 'cartao', 'dinheiro', ''];
const ROTULO_FORMA = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', '': 'Sem forma informada' };
const SEM_NOME = '(sem nome)';

function formatosRelatorio_() {
  return typeof formatarReais !== 'undefined'
    ? { formatarReais, formatarReaisSimples, cpfValido, formatarCpf, apenasDigitos, textoParaData, dataParaTexto, neutralizarFormula }
    : require('./Formatos.js');
}

// Aceita "2026-09", "09/2026" ou vazio (mês atual). hoje = { ano, mes, dia }. Devolve "AAAA-MM" ou null.
function interpretarMes(texto, hoje) {
  const t = String(texto === undefined || texto === null ? '' : texto).trim();
  let ano;
  let mes;
  if (t === '') { ano = hoje.ano; mes = hoje.mes; }
  else {
    const a = /^(\d{4})-(\d{1,2})$/.exec(t);
    const b = /^(\d{1,2})\/(\d{4})$/.exec(t);
    if (a) { ano = Number(a[1]); mes = Number(a[2]); }
    else if (b) { ano = Number(b[2]); mes = Number(b[1]); }
    else return null;
  }
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function chaveNome_(nome) {
  return String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Texto que começa com = + - @ viraria fórmula no Planilhas ou no Excel: a proteção é central (Formatos.js, neutralizarFormula).
function neutralizarFormulaRelatorio_(texto) {
  return formatosRelatorio_().neutralizarFormula(texto);
}

// pagamentos: objetos de Pagamentos. mes: "AAAA-MM".
function consolidarRecebimentos(pagamentos, mes) {
  const f = formatosRelatorio_();
  const avisos = [];
  const incluidos = [];
  const fora = { cortesia: 0, pacote: 0, semDataValida: 0, outroMes: 0, aReceber: 0 };
  let formaDesconhecida = 0;
  let cpfInvalido = 0;

  for (const p of pagamentos) {
    if (p.status === 'cortesia' || p.forma === 'cortesia') { fora.cortesia++; continue; }
    if (p.status !== 'pago') { fora.aReceber++; continue; }
    if (p.forma === 'pacote') { fora.pacote++; continue; }
    if (!FORMAS_RECEBIMENTO.includes(p.forma || '')) { // nunca some em silêncio do carnê-leão (B3)
      formaDesconhecida++;
      avisos.push(`O pagamento ${p.id} está pago, mas com forma de pagamento desconhecida. Não entrou no relatório: use pix, cartao ou dinheiro na coluna forma.`);
      continue;
    }
    if (!f.textoParaData(p.data_pagamento)) { fora.semDataValida++; avisos.push(`O pagamento ${p.id} está pago, mas sem data_pagamento válida (AAAA-MM-DD). Não entrou no relatório.`); continue; }
    if (!String(p.data_pagamento).startsWith(`${mes}-`)) { fora.outroMes++; continue; }
    if (!Number.isSafeInteger(p.valor_centavos) || p.valor_centavos <= 0) { avisos.push(`O pagamento ${p.id} está pago com valor inválido. Não entrou no relatório.`); continue; }
    incluidos.push(p);
  }

  // CPF nunca é deduzido pelo nome (R10): dois pagadores podem ter o mesmo nome. Sem CPF, o grupo é por nome
  // e o relatório avisa quando esse nome também aparece com CPF, para ela confirmar e preencher.
  const grupos = new Map();
  for (const p of incluidos) {
    let cpf = f.apenasDigitos(p.pagador_cpf);
    if (cpf !== '' && !f.cpfValido(cpf)) { cpfInvalido++; cpf = ''; }
    const nomeChave = chaveNome_(p.pagador_nome);
    const chave = cpf ? `C:${cpf}` : `N:${nomeChave}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, { nome: String(p.pagador_nome || '').trim() || SEM_NOME, cpf, nomeChave, quantidade: 0, totalCentavos: 0 });
    }
    const g = grupos.get(chave);
    g.quantidade++;
    g.totalCentavos += p.valor_centavos;
  }
  const pagadores = [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.cpf.localeCompare(b.cpf));

  const porForma = {};
  for (const p of incluidos) porForma[p.forma || ''] = (porForma[p.forma || ''] || 0) + p.valor_centavos;
  const totalCentavos = pagadores.reduce((s, g) => s + g.totalCentavos, 0);

  const semCpf = pagadores.filter((g) => !g.cpf).length;
  if (semCpf > 0) avisos.push(`${semCpf} pagador(es) sem CPF válido. Para o carnê-leão o contador costuma precisar do CPF de quem pagou: preencha "pagador_cpf" na aba Pagamentos e gere de novo.`);
  const nomesComCpf = new Set([...grupos.values()].filter((g) => g.cpf && g.nomeChave).map((g) => g.nomeChave));
  const homonimos = [...grupos.values()].filter((g) => !g.cpf && g.nomeChave && nomesComCpf.has(g.nomeChave)).length;
  if (homonimos > 0) avisos.push(`${homonimos} pagador(es) sem CPF têm o mesmo nome de outro pagador que tem CPF. O kit não junta pelo nome: se for a mesma pessoa, preencha "pagador_cpf" na aba Pagamentos.`);
  if (cpfInvalido > 0) avisos.push(`${cpfInvalido} pagamento(s) com CPF inválido (o número digitado não foi repetido aqui). Confira os 11 números.`);
  if (pagadores.some((g) => g.nome === SEM_NOME)) avisos.push('Há pagamento sem "pagador_nome". Preencha na aba Pagamentos.');
  if (fora.pacote > 0) avisos.push(`${fora.pacote} consulta(s) de pacote ficaram fora dos valores (o dinheiro entra na venda do pacote, não na consulta).`);

  const resultado = { mes, pagadores, totalCentavos, quantidade: incluidos.length, porForma, fora, formaDesconhecida, avisos, valoresConferidos: incluidos.map((p) => p.valor_centavos) };
  verificarTotais(resultado);
  return resultado;
}

// Soma independente dos valores originais: o total geral, a soma por pagador e a soma por forma precisam bater.
// Diferença é defeito do kit, nunca deve chegar ao contador.
function verificarTotais(resultado) {
  const original = resultado.valoresConferidos.reduce((s, v) => s + v, 0);
  const porPagador = resultado.pagadores.reduce((s, g) => s + g.totalCentavos, 0);
  const porForma = Object.values(resultado.porForma).reduce((s, v) => s + v, 0);
  const quantidade = resultado.pagadores.reduce((s, g) => s + g.quantidade, 0);
  if (original !== resultado.totalCentavos || porPagador !== original || porForma !== original || quantidade !== resultado.quantidade) {
    throw new Error('Os totais do relatório não batem. Nada foi gerado; avise o suporte.');
  }
  return true;
}

function cpfParaRelatorio_(g) {
  return g.cpf ? formatosRelatorio_().formatarCpf(g.cpf) : '';
}

// Linhas da aba do relatório (matriz retangular de texto e números).
function linhasAbaRelatorio(resultado) {
  const f = formatosRelatorio_();
  const larg = 4;
  const preencher = (l) => l.concat(Array(larg - l.length).fill(''));
  const linhas = [
    ['Recebimentos do mês', resultado.mes, '', ''],
    ['', '', '', ''],
    ['pagador', 'cpf', 'quantidade', 'total'],
  ];
  for (const g of resultado.pagadores) {
    linhas.push([neutralizarFormulaRelatorio_(g.nome), cpfParaRelatorio_(g), g.quantidade, f.formatarReais(g.totalCentavos)]);
  }
  linhas.push(['TOTAL', '', resultado.quantidade, f.formatarReais(resultado.totalCentavos)]);
  linhas.push(['', '', '', '']);
  linhas.push(['Por forma de pagamento', '', 'quantidade', 'total']);
  for (const forma of Object.keys(resultado.porForma).sort()) {
    linhas.push([ROTULO_FORMA[forma], '', '', f.formatarReais(resultado.porForma[forma])]);
  }
  if (resultado.avisos.length > 0) {
    linhas.push(['', '', '', '']);
    for (const a of resultado.avisos) linhas.push(preencher([`Aviso: ${a}`]));
  }
  return linhas;
}

function campoCsv_(valor) {
  const t = String(valor);
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// CSV para o contador: separador ";" (Excel em português), vírgula decimal, UTF-8 com marca de ordem de bytes.
function montarCsvRelatorio(resultado) {
  const f = formatosRelatorio_();
  const linhas = [['pagador', 'cpf', 'quantidade', 'total_reais']];
  for (const g of resultado.pagadores) {
    linhas.push([neutralizarFormulaRelatorio_(g.nome), cpfParaRelatorio_(g), g.quantidade, f.formatarReaisSimples(g.totalCentavos)]);
  }
  linhas.push(['TOTAL', '', resultado.quantidade, f.formatarReaisSimples(resultado.totalCentavos)]);
  return `﻿${linhas.map((l) => l.map(campoCsv_).join(';')).join('\r\n')}\r\n`;
}

function nomeArquivoRelatorio(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês inválido para o nome do arquivo.');
  return `Relatorio-${mes}.csv`;
}

function nomeAbaRelatorio(mes) {
  return `Relatório ${mes}`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    interpretarMes, consolidarRecebimentos, verificarTotais, linhasAbaRelatorio, montarCsvRelatorio,
    nomeArquivoRelatorio, nomeAbaRelatorio,
  };
}
