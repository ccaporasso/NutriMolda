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
  if (typeof instanteIso !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(instanteIso)) return null;
  const ms = Date.parse(instanteIso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms - DESLOCAMENTO_SAO_PAULO_MS);
  return {
    data: dataParaTexto({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }),
    hora: `${preencher2(d.getUTCHours())}:${preencher2(d.getUTCMinutes())}`,
  };
}

// 15000 -> "R$ 150,00"; 123456 -> "R$ 1.234,56".
function formatarReais(centavos) {
  if (!Number.isSafeInteger(centavos) || centavos < 0) throw new Error('Valor em centavos inválido.');
  const inteiro = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${inteiro},${preencher2(centavos % 100)}`;
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
    formatarReais, formatarReaisSimples, apenasDigitos, cpfValido, formatarCpf,
  };
}
