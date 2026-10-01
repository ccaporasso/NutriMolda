// Datas, dinheiro e CPF (lógica pura, sem chamadas ao Google).
// Datas viram texto AAAA-MM-DD e HH:mm no fuso de São Paulo (UTC-3 o ano todo desde 2019).
// Dinheiro é sempre centavos inteiros; reais só aparecem na saída (D13).

const DESLOCAMENTO_SAO_PAULO_MS = 3 * 60 * 60 * 1000;

function preencher2(n) {
  return String(n).padStart(2, '0');
}

// data = { ano, mes, dia } (mes 1-12) -> "2026-09-30".
function dataParaTexto(data) {
  return `${data.ano}-${preencher2(data.mes)}-${preencher2(data.dia)}`;
}

// Soma dias sem depender do fuso do computador.
function somarDiasNaData(data, dias) {
  const d = new Date(Date.UTC(data.ano, data.mes - 1, data.dia + dias));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

// "2026-09-30" -> { ano, mes, dia } ou null se não for uma data real.
function textoParaData(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto));
  if (!m) return null;
  const data = { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
  return dataParaTexto(somarDiasNaData(data, 0)) === String(texto) ? data : null;
}

// Instante (texto ISO do Google Agenda, com fuso) -> { data: "2026-09-30", hora: "09:00" } em São Paulo.
// Devolve null se o texto não for um instante válido.
function dataHoraLocal(instanteIso) {
  // Exige o fuso explícito (Z ou +hh:mm): sem ele o resultado dependeria do fuso da máquina que lê. A API do Google Agenda sempre o envia.
  if (typeof instanteIso !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(instanteIso)) return null;
  const ms = Date.parse(instanteIso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms - DESLOCAMENTO_SAO_PAULO_MS);
  return {
    data: dataParaTexto({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }),
    hora: `${preencher2(d.getUTCHours())}:${preencher2(d.getUTCMinutes())}`,
  };
}

// Proteção CENTRAL contra injeção de fórmula (Planilhas e CSV aberto no Excel): texto que começa com = + - @ (ou que começa com
// tabulação ou retorno de carro, ou com espaços invisíveis seguidos desses sinais) ganha um espaço na frente e vira só texto.
// Todo texto que o kit escreve numa planilha ou num CSV e que veio de alguém passa por aqui (Registro, Relatório, Respostas, LeitorAbas).
// Não trata o sinal "＝" de largura total: nem o Planilhas nem o Excel o leem como fórmula.
function neutralizarFormula(texto) {
  const t = String(texto === undefined || texto === null ? '' : texto);
  return /^[\s\u00A0\u200B-\u200D\u2060\uFEFF]*[=+\-@]/.test(t) || /^[\t\r]/.test(t) ? ` ${t}` : t;
}

const LIMITE_PRECO_CENTAVOS = 10000000;

// 15000 -> "R$ 150,00"; 123456 -> "R$ 1.234,56".
function formatarReais(centavos) {
  if (!Number.isSafeInteger(centavos) || centavos < 0) throw new Error('Valor em centavos inválido.');
  const inteiro = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${inteiro},${preencher2(centavos % 100)}`;
}

// Lê um valor digitado em reais e devolve { ok: true, centavos } ou { ok: false, motivo }.
// Aceita "150", "150,00", "150.5", "R$ 150,00" e "1.500,00". Zero, negativo, mais de duas casas e texto são recusados.
function lerReais(texto) {
  const bruto = String(texto === undefined || texto === null ? '' : texto).trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (bruto === '') return { ok: false, motivo: 'Digite o valor em reais, por exemplo 150,00.' };
  let m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(bruto); // 1.500,00 ou 150,5
  if (!m) m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(bruto); // 150.50 (ponto decimal)
  if (!m) return { ok: false, motivo: 'Não entendi o valor. Use só números, com vírgula para os centavos (por exemplo 150,00).' };
  const reais = Number(m[1].replace(/\./g, ''));
  const centavos = reais * 100 + Number((m[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos <= 0) return { ok: false, motivo: 'O valor precisa ser maior que zero. Consulta gratuita é cortesia, marcada à parte.' };
  if (centavos > LIMITE_PRECO_CENTAVOS) return { ok: false, motivo: 'O valor está alto demais (acima de R$ 100.000,00). Confira.' };
  return { ok: true, centavos };
}

// 15000 -> "150,00" (sem símbolo, para o CSV).
function formatarReaisSimples(centavos) {
  return formatarReais(centavos).replace('R$ ', '');
}

function apenasDigitos(texto) {
  return String(texto === undefined || texto === null ? '' : texto).replace(/\D/g, '');
}

// Confere os dois dígitos verificadores. Recusa 11 dígitos iguais.
function cpfValido(texto) {
  const d = apenasDigitos(texto);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[tamanho])) return false;
  }
  return true;
}

// "12345678909" -> "123.456.789-09" (só depois de validar).
function formatarCpf(texto) {
  const d = apenasDigitos(texto);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    dataParaTexto, somarDiasNaData, textoParaData, dataHoraLocal,
    formatarReais, formatarReaisSimples, lerReais, apenasDigitos, cpfValido, formatarCpf, neutralizarFormula,
  };
}
