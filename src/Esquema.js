// Esquema da planilha (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, "Modelo de dados".

const LISTAS = {
  modo_acompanhamento: ['porta_aberta', 'leve', 'proximo'],
  tipo_consulta: ['primeira', 'retorno'],
  status_consulta: ['marcada', 'realizada', 'faltou', 'cancelada'],
  forma_pagamento: ['pix', 'cartao', 'dinheiro', 'pacote', 'cortesia'],
  status_pagamento: ['a_receber', 'pago', 'cortesia'],
  nivel_registro: ['info', 'aviso', 'erro'],
};

// Valor inicial vazio = a nutricionista precisa preencher.
const CONFIGURACOES_INICIAIS = [
  ['nome_profissional', ''],
  ['crn', ''],
  ['valor_primeira_consulta_centavos', 0],
  ['valor_retorno_centavos', 0],
  ['regra_retorno_dias', 30],
  ['chave_pix', ''],
  ['nome_recebedor_pix', ''],
  ['cidade_recebedor_pix', ''],
  ['calendario_id', 'primary'],
  ['prefixo_evento_consulta', 'Consulta'],
  ['email_alertas', ''],
  ['id_modelo_recibo', ''],
  ['id_pasta_recibos', ''],
];

// Colunas que guardam identificadores: ficam como texto para o Google não
// tirar o zero à esquerda (CPF, telefone, códigos). `valor` é a coluna B de
// Configurações (chave Pix, CRN, ids): entra como texto antes de qualquer conversão.
// `data_hora` (Registro) fica como texto para o horário gravado não ser
// reinterpretado em outro fuso pelo Planilhas.
const COLUNAS_TEXTO = ['codigo', 'codigo_paciente', 'telefone', 'pagador_cpf', 'id_evento', 'id', 'valor', 'data_hora'];

// `validacoes`: coluna do cabeçalho -> nome da lista em LISTAS.
const ABAS = [
  { nome: 'Configurações', cabecalho: ['chave', 'valor'], validacoes: {} },
  {
    nome: 'Pacientes',
    cabecalho: ['codigo', 'primeiro_nome', 'inicial_sobrenome', 'telefone', 'email',
      'modo_acompanhamento', 'autorizou_mensagens_em', 'ativo'],
    validacoes: { modo_acompanhamento: 'modo_acompanhamento' },
  },
  {
    nome: 'Consultas',
    cabecalho: ['id_evento', 'data', 'hora', 'tipo', 'codigo_paciente', 'status', 'atualizado_em'],
    validacoes: { tipo: 'tipo_consulta', status: 'status_consulta' },
    // Data e hora guardadas como texto (2026-09-30 e 09:00): o Planilhas não converte em outro fuso (T05).
    textoExtra: ['data', 'hora', 'atualizado_em'],
  },
  {
    nome: 'Pagamentos',
    cabecalho: ['id', 'id_evento', 'codigo_paciente', 'pagador_nome', 'pagador_cpf',
      'valor_centavos', 'forma', 'status', 'data_pagamento', 'link_recibo'],
    validacoes: { forma: 'forma_pagamento', status: 'status_pagamento' },
    textoExtra: ['data_pagamento'], // texto AAAA-MM-DD (T07/T08)
  },
  {
    nome: 'Pacotes',
    cabecalho: ['codigo_paciente', 'total_consultas', 'usadas', 'valor_centavos', 'inicio'],
    validacoes: {},
  },
  {
    nome: 'Despesas',
    cabecalho: ['data', 'descricao', 'categoria', 'valor_centavos', 'link_comprovante'],
    validacoes: {},
  },
  {
    nome: 'Registro',
    cabecalho: ['data_hora', 'modulo', 'nivel', 'mensagem'],
    validacoes: { nivel: 'nivel_registro' },
  },
];

// Recebe o que já existe: { 'Aba': { cabecalho: [...], chaves: [...] } } e
// devolve só o que falta fazer. Uma aba existente é preservada; se o
// cabeçalho dela estiver diferente, vira aviso (nunca sobrescreve dados).
function planejarInstalacao(existente) {
  const plano = { criarAbas: [], escreverCabecalho: [], chavesNovas: [], avisos: [] };
  for (const aba of ABAS) {
    const atual = existente[aba.nome];
    if (!atual) {
      plano.criarAbas.push(aba.nome);
      plano.escreverCabecalho.push(aba.nome);
      continue;
    }
    const atualCab = (atual.cabecalho || []).map(String);
    const vazio = atualCab.every((c) => c === '');
    if (vazio) {
      plano.escreverCabecalho.push(aba.nome);
    } else if (JSON.stringify(atualCab.slice(0, aba.cabecalho.length)) !== JSON.stringify(aba.cabecalho)) {
      plano.avisos.push(`A aba "${aba.nome}" tem cabeçalho diferente do esperado. Não foi alterada; confira com o suporte.`);
    }
  }
  // Se Configurações tem cabeçalho estranho, não acrescenta nada nela.
  const configComAviso = plano.avisos.some((a) => a.includes('"Configurações"'));
  const chavesExistentes = new Set((existente['Configurações'] || {}).chaves || []);
  if (!configComAviso) for (const [chave, valor] of CONFIGURACOES_INICIAIS) {
    if (!chavesExistentes.has(chave)) plano.chavesNovas.push([chave, valor]);
  }
  return plano;
}

// Confere o cabeçalho lido (largura completa do esquema) com o esperado, coluna a coluna, em ordem.
// Devolve a mensagem para a nutricionista, ou '' se está certo. Colunas a mais, à direita, são permitidas.
function divergenciaDeCabecalho(aba, lido) {
  const atual = (lido || []).map((c) => String(c === undefined || c === null ? '' : c).trim());
  for (let i = 0; i < aba.cabecalho.length; i++) {
    if (atual[i] !== aba.cabecalho[i]) {
      return `A aba "${aba.nome}" está com o cabeçalho diferente do esperado (coluna ${i + 1} deveria ser "${aba.cabecalho[i]}"). `
        + 'Nada foi lido nem gravado. Não mude a ordem nem o nome das colunas; peça ajuda ao suporte.';
    }
  }
  return '';
}

// Colunas (1 = A) que recebem lista suspensa, com os valores permitidos.
function colunasComValidacao(aba) {
  return Object.entries(aba.validacoes).map(([coluna, lista]) => ({
    coluna: aba.cabecalho.indexOf(coluna) + 1,
    valores: LISTAS[lista],
  }));
}

// Posições (1 = A) das colunas de texto de uma aba.
function colunasDeTexto(aba) {
  return aba.cabecalho
    .map((nome, i) => (COLUNAS_TEXTO.includes(nome) || (aba.textoExtra || []).includes(nome) ? i + 1 : 0))
    .filter((n) => n > 0);
}

if (typeof module !== 'undefined') {
  module.exports = { colunasDeTexto, LISTAS, CONFIGURACOES_INICIAIS, ABAS, planejarInstalacao, colunasComValidacao, divergenciaDeCabecalho };
}
