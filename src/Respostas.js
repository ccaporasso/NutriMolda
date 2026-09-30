// T20 (ESQUELETO): pergunta semanal por formulário, com o código do paciente já preenchido, e a aba Respostas.
// Só lógica pura. Nada é criado no Google nesta etapa: o formulário e a aba ainda não existem.
// Decisões pendentes estão marcadas com PENDENTE Pn e listadas em docs/PENDENCIAS-FASE-2B.md.

// PENDENTE P1: as opções de resposta e o texto da pergunta são da nutricionista. Estas são só um esqueleto.
const OPCOES_RESPOSTA = ['sim', 'mais_ou_menos', 'ainda_nao'];
// PENDENTE P2: se haverá campo de nota escrita e o tamanho máximo. Nota livre pode trazer dado de saúde.
const MAX_NOTA = 300;
const PADRAO_CODIGO_RESPOSTA = /^P\d{4}$/;
const INICIO_URL_FORMULARIO = 'https://docs.google.com/forms/';

// Aba Respostas (ainda NÃO instalada pelo instalador). O paciente nunca é identificado por nome: só pelo código.
const ABA_RESPOSTAS = { nome: 'Respostas', cabecalho: ['data_hora', 'codigo_paciente', 'resposta', 'nota'] };

// Link do formulário com o código já preenchido (padrão "pp_url" do Google Formulários).
// PENDENTE P11: o código P0001 é sequencial e não prova quem responde (trocar para P0002 responderia por outro paciente).
// Antes de instalar a T20, decidir entre token aleatório por paciente ou login Google no formulário.
// idCampoCodigo é o "entry.NNN" do campo do código, que só se descobre no formulário real (PENDENTE P8).
function montarLinkFormulario({ urlBase, idCampoCodigo, codigo }) {
  if (typeof urlBase !== 'string' || !urlBase.startsWith(INICIO_URL_FORMULARIO)) {
    throw new Error('O endereço do formulário precisa ser de um Google Formulário (começa com https://docs.google.com/forms/).');
  }
  if (typeof idCampoCodigo !== 'string' || !/^entry\.\d+$/.test(idCampoCodigo)) {
    throw new Error('O identificador do campo do código precisa ter o formato entry.123456.');
  }
  if (!PADRAO_CODIGO_RESPOSTA.test(String(codigo))) throw new Error('Código de paciente inválido (esperado algo como P0001).');
  const base = urlBase.split('?')[0];
  return `${base}?usp=pp_url&${idCampoCodigo}=${encodeURIComponent(codigo)}`;
}

function textoParaDataRespostas_(texto) {
  return typeof textoParaData !== 'undefined' ? textoParaData(texto) : require('./Formatos.js').textoParaData(texto);
}

// "AAAA-MM-DD HH:MM:SS" com data real (fevereiro, ano bissexto) e hora entre 00:00:00 e 23:59:59.
function dataHoraRespostaValida_(texto) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(texto));
  return m !== null && textoParaDataRespostas_(m[1]) !== null && Number(m[2]) <= 23 && Number(m[3]) <= 59 && Number(m[4]) <= 59;
}

function mascararRespostas_(texto) {
  return typeof mascararDadosPessoais !== 'undefined' ? mascararDadosPessoais(texto) : require('./Registro.js').mascararDadosPessoais(texto);
}

// Confere uma resposta recebida. Devolve { ok: true, linha } ou { ok: false, motivo } em português.
// Código desconhecido é recusado: resposta de quem não é paciente não entra na planilha.
function validarResposta({ dataHora, codigo, resposta, nota }, codigosConhecidos) {
  if (!dataHoraRespostaValida_(dataHora)) return { ok: false, motivo: 'Data e hora da resposta inválidas.' };
  if (!PADRAO_CODIGO_RESPOSTA.test(String(codigo)) || !codigosConhecidos.map(String).includes(String(codigo))) {
    return { ok: false, motivo: 'Resposta de um código que não é de paciente cadastrado. Nada foi gravado.' };
  }
  if (!OPCOES_RESPOSTA.includes(resposta)) return { ok: false, motivo: `Resposta inválida (esperado: ${OPCOES_RESPOSTA.join(', ')}).` };
  let texto = mascararRespostas_(nota === undefined || nota === null ? '' : nota).trim();
  if (Array.from(texto).length > MAX_NOTA) texto = `${Array.from(texto).slice(0, MAX_NOTA).join('')}…`;
  if (/^[=+\-@]/.test(texto)) texto = ` ${texto}`; // não vira fórmula na planilha
  return { ok: true, linha: [String(dataHora), String(codigo), resposta, texto] };
}

if (typeof module !== 'undefined') {
  module.exports = { OPCOES_RESPOSTA, MAX_NOTA, ABA_RESPOSTAS, montarLinkFormulario, validarResposta };
}
