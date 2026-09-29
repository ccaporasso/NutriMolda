// Leitura e validação das Configurações (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, aba "Configurações".
// As mensagens citam só o NOME da chave, nunca o valor digitado (chave Pix e
// e-mail são dados pessoais).

const CHAVES_CONFIGURACAO = [
  'nome_profissional', 'crn', 'valor_primeira_consulta_centavos', 'valor_retorno_centavos',
  'regra_retorno_dias', 'chave_pix', 'nome_recebedor_pix', 'cidade_recebedor_pix',
  'calendario_id', 'prefixo_evento_consulta', 'email_alertas', 'id_modelo_recibo', 'id_pasta_recibos',
];

// Sem estes o kit não funciona (identidade, Pix e alerta de falha): vazio = erro.
const CHAVES_OBRIGATORIAS = [
  'nome_profissional', 'crn', 'chave_pix', 'nome_recebedor_pix', 'cidade_recebedor_pix', 'email_alertas',
];

const LIMITES_PIX = { nome_recebedor_pix: 25, cidade_recebedor_pix: 15 };

// Preço por tipo de consulta (valores da lista tipo_consulta em Esquema.js).
const CHAVE_PRECO_POR_TIPO = {
  primeira: 'valor_primeira_consulta_centavos',
  retorno: 'valor_retorno_centavos',
};
const CHAVES_PRECO = Object.values(CHAVE_PRECO_POR_TIPO);
const NOME_TIPO = { primeira: 'da primeira consulta', retorno: 'do retorno' };

// Abaixo disto (R$ 10,00) provavelmente digitou reais em vez de centavos.
const PRECO_SUSPEITO_CENTAVOS = 1000;

const PADROES_CONFIGURACAO = { calendario_id: 'primary', prefixo_evento_consulta: 'Consulta' };

// Só avisam: entram em uso em tarefas posteriores.
const AVISOS_SE_VAZIO = {
  id_modelo_recibo: 'O recibo em PDF (T09) ainda não pode ser gerado.',
  id_pasta_recibos: 'O recibo em PDF (T09) ainda não pode ser salvo.',
  regra_retorno_dias: 'Sem ela o kit não sugere o retorno.',
};

function ehVazio_(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

// Aceita só inteiro >= 0, como número ou como texto só com algarismos.
function lerInteiro_(valor) {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || !Number.isSafeInteger(Math.trunc(valor))) return { motivo: 'texto' };
    if (valor < 0) return { motivo: 'negativo' };
    if (!Number.isInteger(valor)) return { motivo: 'fracionario' };
    return { numero: valor };
  }
  if (typeof valor === 'string') {
    const t = valor.trim();
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      return Number.isSafeInteger(n) ? { numero: n } : { motivo: 'texto' };
    }
    if (/^-\d+([.,]\d+)?$/.test(t)) return { motivo: 'negativo' };
    if (/^\d+[.,]\d+$/.test(t)) return { motivo: 'fracionario' };
  }
  return { motivo: 'texto' };
}

function textoDe_(valor) {
  return typeof valor === 'string' ? valor.trim() : String(valor);
}

function validarPreco_(chave, valor, erros, avisos) {
  if (ehVazio_(valor)) {
    avisos.push(`"${chave}" não foi preenchida. Nenhuma cobrança desse tipo será criada até você informar o preço.`);
    return null;
  }
  const lido = lerInteiro_(valor);
  if (lido.numero === undefined) {
    const como = {
      negativo: 'não pode ser negativa',
      fracionario: 'precisa ser um número inteiro de centavos, sem vírgula nem ponto',
      texto: 'precisa ser um número inteiro de centavos, só com algarismos',
    }[lido.motivo];
    erros.push(`"${chave}" ${como}. Para R$ 150,00, digite 15000.`);
    return null;
  }
  if (lido.numero === 0) {
    avisos.push(`"${chave}" está em zero. Nenhuma cobrança desse tipo será criada até você informar o preço. Consulta gratuita deve ser marcada como cortesia.`);
  } else if (lido.numero < PRECO_SUSPEITO_CENTAVOS) {
    avisos.push(`"${chave}" está abaixo de R$ 10,00. Confira: o campo é em centavos (R$ 150,00 = 15000).`);
  }
  return lido.numero;
}

function validarDias_(chave, valor, erros, avisos) {
  if (ehVazio_(valor)) {
    avisos.push(`"${chave}" não foi preenchida. ${AVISOS_SE_VAZIO[chave]}`);
    return null;
  }
  const lido = lerInteiro_(valor);
  if (lido.numero === undefined || lido.numero < 1) {
    erros.push(`"${chave}" precisa ser um número inteiro de dias, maior que zero (por exemplo, 30).`);
    return null;
  }
  return lido.numero;
}

function validarTexto_(chave, valor, erros, avisos) {
  if (ehVazio_(valor)) {
    if (CHAVES_OBRIGATORIAS.includes(chave)) {
      erros.push(`A configuração "${chave}" não foi preenchida. Preencha na aba Configurações.`);
      return null;
    }
    if (chave in PADROES_CONFIGURACAO) {
      avisos.push(`"${chave}" está vazia. Foi usado o padrão do kit.`);
      return PADROES_CONFIGURACAO[chave];
    }
    avisos.push(`"${chave}" não foi preenchida. ${AVISOS_SE_VAZIO[chave]}`);
    return null;
  }
  const texto = textoDe_(valor);
  const limite = LIMITES_PIX[chave];
  if (limite && Array.from(texto).length > limite) {
    erros.push(`"${chave}" tem ${Array.from(texto).length} caracteres; o máximo do Pix é ${limite}. Encurte o texto.`);
    return null;
  }
  if (chave === 'email_alertas' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) {
    erros.push('"email_alertas" não parece um e-mail válido (esperado algo como nome@exemplo.com).');
    return null;
  }
  return texto;
}

// `linhas`: as linhas da aba, sem o cabeçalho, no formato [chave, valor].
// Devolve { config, erros, avisos }. Valor ausente ou inválido vira null em `config`.
function validarConfiguracoes(linhas) {
  const erros = [];
  const avisos = [];
  const config = {};
  const valores = new Map();
  const repetidas = new Set();

  for (const linha of linhas || []) {
    const chave = ehVazio_(linha && linha[0]) ? '' : textoDe_(linha[0]);
    if (!chave) continue;
    if (valores.has(chave)) repetidas.add(chave);
    else valores.set(chave, linha[1]);
  }

  for (const chave of CHAVES_CONFIGURACAO) {
    if (repetidas.has(chave)) {
      erros.push(`A configuração "${chave}" aparece mais de uma vez. Deixe só uma linha.`);
      config[chave] = null;
    } else if (!valores.has(chave)) {
      if (CHAVES_OBRIGATORIAS.includes(chave)) {
        erros.push(`Falta a linha "${chave}" na aba Configurações. Rode Kit do Consultório > Instalar/atualizar planilha.`);
        config[chave] = null;
      } else if (CHAVES_PRECO.includes(chave)) {
        avisos.push(`Falta a linha "${chave}" na aba Configurações. Nenhuma cobrança desse tipo será criada. Rode Kit do Consultório > Instalar/atualizar planilha.`);
        config[chave] = null;
      } else {
        avisos.push(`Falta a linha "${chave}" na aba Configurações.${chave in PADROES_CONFIGURACAO ? ' Foi usado o padrão do kit.' : ''}`);
        config[chave] = PADROES_CONFIGURACAO[chave] === undefined ? null : PADROES_CONFIGURACAO[chave];
      }
    } else if (CHAVES_PRECO.includes(chave)) {
      config[chave] = validarPreco_(chave, valores.get(chave), erros, avisos);
    } else if (chave === 'regra_retorno_dias') {
      config[chave] = validarDias_(chave, valores.get(chave), erros, avisos);
    } else {
      config[chave] = validarTexto_(chave, valores.get(chave), erros, avisos);
    }
  }
  return { config, erros, avisos };
}

// Trava antes de qualquer cobrança: só devolve preço inteiro e maior que zero.
// Configuração incompleta nunca vira cobrança de R$ 0,00; consulta gratuita
// é cortesia, escolhida à parte e de forma explícita.
function precoParaCobranca(config, tipo) {
  const chave = CHAVE_PRECO_POR_TIPO[tipo];
  if (!chave) throw new Error('Tipo de consulta inválido para cobrança (esperado: primeira ou retorno).');
  const valor = config ? config[chave] : undefined;
  if (!Number.isSafeInteger(valor) || valor <= 0) {
    throw new Error(
      `O preço ${NOME_TIPO[tipo]} não está configurado. Nenhuma cobrança foi criada. `
      + `Preencha "${chave}" na aba Configurações ou, se a consulta é gratuita, marque-a como cortesia.`,
    );
  }
  return valor;
}

function montarMensagemErros(resultado) {
  return ['Há problemas na aba Configurações:']
    .concat(resultado.erros.map((e) => `- ${e}`))
    .concat('Corrija e tente de novo.')
    .join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = {
    CHAVES_CONFIGURACAO, CHAVES_OBRIGATORIAS, LIMITES_PIX, CHAVE_PRECO_POR_TIPO,
    validarConfiguracoes, precoParaCobranca, montarMensagemErros,
  };
}
