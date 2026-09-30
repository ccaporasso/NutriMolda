// Registro e alerta de falha (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, aba "Registro" e fluxo 7.
// Regra: nada de nome de paciente nem dado de saúde. O kit só escreve códigos
// (P0001); aqui ainda mascaramos e-mail, telefone e CPF que escapem por engano.

const MAX_MENSAGEM = 500;
const TEXTO_OCULTO = '[oculto]';

function niveisValidos_() {
  return (typeof LISTAS !== 'undefined' ? LISTAS : require('./Esquema.js').LISTAS).nivel_registro;
}

// Troca e-mail e sequências longas de dígitos (CPF, telefone) por [oculto].
// Nomes de pessoas não dá para reconhecer: a regra continua sendo só usar o código.
function mascararDadosPessoais(texto) {
  return String(texto)
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, TEXTO_OCULTO)
    .replace(/\d{4}-\d{2}-\d{2}|\+?\(?\d[\d ().-]{6,}\d/g, (trecho) => (
      // Data no formato 2026-09-29 não é dado pessoal: fica.
      /^\d{4}-\d{2}-\d{2}$/.test(trecho) || (trecho.match(/\d/g) || []).length < 8 ? trecho : TEXTO_OCULTO
    ));
}

// O Planilhas trata texto que começa com = + - @ como fórmula. Um espaço na frente evita.
function neutralizarFormula_(texto) {
  return /^[=+\-@]/.test(texto) ? ` ${texto}` : texto;
}

// O módulo é um nome fixo do kit (ex.: "sincronizacao"), nunca texto digitado.
function limparModulo_(modulo) {
  const texto = String(modulo === undefined || modulo === null ? '' : modulo).trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(texto) ? texto : 'desconhecido';
}

// Linha na ordem das colunas de Registro: data_hora, modulo, nivel, mensagem.
// `dataHoraTexto` já vem no fuso America/Sao_Paulo (formatado pela camada do Google).
function montarLinhaRegistro(dataHoraTexto, modulo, nivel, mensagem) {
  if (!niveisValidos_().includes(nivel)) {
    throw new Error(`Nível de registro inválido (esperado: ${niveisValidos_().join(', ')}).`);
  }
  let texto = mascararDadosPessoais(mensagem === undefined || mensagem === null ? '' : mensagem).trim();
  if (Array.from(texto).length > MAX_MENSAGEM) texto = `${Array.from(texto).slice(0, MAX_MENSAGEM).join('')}…`;
  return [String(dataHoraTexto), limparModulo_(modulo), nivel, neutralizarFormula_(texto)];
}

// O e-mail não leva a mensagem do erro: só o módulo e o horário. O detalhe fica no Registro.
function montarEmailAlerta(modulo, dataHoraTexto) {
  const nome = limparModulo_(modulo);
  return {
    assunto: `Kit do Consultório: falha no módulo ${nome}`,
    corpo: [
      'O Kit do Consultório registrou uma falha.',
      '',
      `Módulo: ${nome}`,
      `Quando: ${dataHoraTexto} (horário de São Paulo)`,
      '',
      'Para ver o detalhe, abra a planilha e consulte a aba Registro.',
      'Este e-mail não traz dados de pacientes.',
    ].join('\n'),
  };
}

// Valores conhecidos: só eles podem aparecer numa mensagem gerada a partir de uma exceção.
// Mensagem de exceção (erro.message) pode trazer nome ou dado de saúde e nunca é copiada.
const MODULOS_CONHECIDOS = [
  'alertas', 'configuracoes', 'instalador', 'menu', 'pagamentos', 'pix', 'recibo', 'registro', 'relatorio', 'sincronizacao', 'teste',
];
const TIPOS_ERRO_CONHECIDOS = ['Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'];

function moduloConhecido(modulo) {
  return MODULOS_CONHECIDOS.includes(modulo) ? modulo : 'desconhecido';
}

function tipoDeErro(erro) {
  const nome = erro && typeof erro === 'object' ? erro.name : undefined;
  return TIPOS_ERRO_CONHECIDOS.includes(nome) ? nome : 'desconhecido';
}

// Mensagem fixa para o Registro: só módulo e tipo, ambos de listas fechadas.
function descreverFalha(modulo, erro) {
  return `Falha no módulo ${moduloConhecido(modulo)} (tipo ${tipoDeErro(erro)})`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    MAX_MENSAGEM, TEXTO_OCULTO, mascararDadosPessoais, montarLinhaRegistro, montarEmailAlerta,
    MODULOS_CONHECIDOS, TIPOS_ERRO_CONHECIDOS, moduloConhecido, tipoDeErro, descreverFalha,
  };
}
