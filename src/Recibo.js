// Recibo (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, "O recibo". Traz: nome e CRN da nutricionista, quem pagou (e o paciente,
// se for outra pessoa), valor, data, descrição do serviço e, se ela usar, o CPF do pagador.
// O NOME DO ARQUIVO leva só o número do recibo e o código do paciente (regra 6). A chamada ao Google está em GeradorRecibo.js.

const FORMAS_COM_RECIBO = ['pix', 'cartao', 'dinheiro'];
const NOME_FORMA_RECIBO = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };

function formatosRecibo_() {
  return typeof formatarReais !== 'undefined'
    ? { formatarReais, cpfValido, formatarCpf, textoParaData }
    : require('./Formatos.js');
}

// Modelo padrão (um parágrafo por linha), com os campos entre chaves duplas.
function linhasModeloRecibo() {
  return [
    'RECIBO Nº {{numero_recibo}}',
    '',
    'Recebi de {{pagador}}',
    '{{linha_cpf}}',
    'a quantia de {{valor}}, referente a {{descricao}}.',
    '{{linha_paciente}}',
    'Forma de pagamento: {{forma}}',
    'Data do pagamento: {{data}}',
    '',
    '{{profissional}}',
    'Nutricionista — {{crn}}',
  ];
}

// Texto digitado que vai para o recibo: sem "$" e "\" (cuidado herdado da troca por expressão regular do Docs) e sem
// chaves, para um nome nunca parecer um campo {{...}} do modelo. A troca em si é literal (GeradorRecibo.js).
function textoSeguroParaDocs(texto) {
  return String(texto).replace(/[$\\{}]/g, '').replace(/\s+/g, ' ').trim();
}

// Só letras, números e hífen: nome de arquivo sem nome de pessoa.
function nomeArquivoRecibo(pagamento) {
  const parte = (v) => String(v).replace(/[^A-Za-z0-9]/g, '');
  return `Recibo-${parte(pagamento.id)}-${parte(pagamento.codigo_paciente)}.pdf`;
}

// "2026-09-30" -> "30/09/2026".
function dataBrasileira(texto) {
  const d = formatosRecibo_().textoParaData(texto);
  return d ? `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}/${d.ano}` : null;
}

function semAcento_(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// O paciente só guarda primeiro nome e inicial: considera a mesma pessoa se o pagador começa
// com o primeiro nome e algum outro nome começa com a inicial. Na dúvida, a linha "Paciente" aparece.
function mesmaPessoaRecibo_(nomePagador, paciente) {
  const partes = semAcento_(nomePagador).split(' ');
  const inicial = semAcento_(paciente.inicial_sobrenome || '').charAt(0);
  return partes.length >= 2 && partes[0] === semAcento_(paciente.primeiro_nome)
    && inicial !== '' && partes.slice(1).some((p) => p.charAt(0) === inicial);
}

// Devolve { erros, dados }. `erros` são mensagens em português, sem CPF nem outro dado digitado.
// `dados.campos` é o que entra no modelo; `dados.nomeArquivo` é o nome do PDF.
function montarDadosRecibo({ pagamento, config, paciente, consulta }) {
  const f = formatosRecibo_();
  const erros = [];
  const id = pagamento && pagamento.id ? pagamento.id : '(sem id)';
  if (!pagamento) return { erros: ['Pagamento não encontrado.'], dados: null };

  if (pagamento.link_recibo) {
    erros.push(`O pagamento ${id} já tem recibo. Para gerar de novo, apague o link na coluna link_recibo.`);
    return { erros, dados: null, jaTem: true };
  }
  if (pagamento.status !== 'pago') erros.push(`O pagamento ${id} não está pago. Só se emite recibo de pagamento recebido.`);
  else if (!FORMAS_COM_RECIBO.includes(pagamento.forma)) erros.push(`O pagamento ${id} é ${pagamento.forma || 'sem forma'}: recibo só para Pix, cartão ou dinheiro.`);
  if (!Number.isSafeInteger(pagamento.valor_centavos) || pagamento.valor_centavos <= 0) erros.push(`O valor do pagamento ${id} precisa ser maior que zero.`);
  const nomePagador = textoSeguroParaDocs(pagamento.pagador_nome || '');
  if (nomePagador === '') erros.push(`Preencha "pagador_nome" no pagamento ${id} (quem pagou).`);
  const data = dataBrasileira(pagamento.data_pagamento);
  if (!data) erros.push(`Preencha "data_pagamento" no pagamento ${id} no formato AAAA-MM-DD.`);
  const cpfBruto = String(pagamento.pagador_cpf || '').trim();
  if (cpfBruto !== '' && !f.cpfValido(cpfBruto)) {
    erros.push(`O CPF do pagador no pagamento ${id} não é válido. Confira os 11 números (zero à esquerda incluído) ou deixe em branco.`);
  }
  for (const chave of ['nome_profissional', 'crn', 'id_modelo_recibo', 'id_pasta_recibos']) {
    if (!config || !config[chave]) erros.push(`Preencha "${chave}" na aba Configurações.`);
  }
  if (erros.length > 0) return { erros, dados: null };

  const nomePaciente = paciente ? textoSeguroParaDocs(`${paciente.primeiro_nome} ${paciente.inicial_sobrenome}`) : '';
  const mesmoNome = paciente ? mesmaPessoaRecibo_(nomePagador, paciente) : false;
  const dataConsulta = consulta ? dataBrasileira(consulta.data) : null;
  return {
    erros: [],
    dados: {
      nomeArquivo: nomeArquivoRecibo(pagamento),
      campos: {
        numero_recibo: pagamento.id,
        pagador: nomePagador,
        linha_cpf: cpfBruto ? `CPF: ${f.formatarCpf(cpfBruto)}` : '',
        valor: f.formatarReais(pagamento.valor_centavos),
        descricao: dataConsulta ? `consulta de nutrição realizada em ${dataConsulta}` : 'consulta de nutrição',
        linha_paciente: nomePaciente && !mesmoNome ? `Paciente: ${nomePaciente}` : '',
        forma: NOME_FORMA_RECIBO[pagamento.forma],
        data,
        profissional: textoSeguroParaDocs(config.nome_profissional),
        crn: textoSeguroParaDocs(config.crn),
      },
    },
  };
}

// Nomes dos campos que ainda aparecem no texto depois da troca (modelo dela com campo desconhecido).
function camposSobrando(texto) {
  return [...new Set(String(texto).match(/\{\{[^{}]*\}\}/g) || [])];
}

// Campos que o modelo precisa ter (R09). linha_cpf e linha_paciente só são exigidos quando têm conteúdo neste recibo.
const CAMPOS_OBRIGATORIOS_RECIBO = ['numero_recibo', 'pagador', 'valor', 'descricao', 'forma', 'data', 'profissional', 'crn'];
const CAMPOS_CONDICIONAIS_RECIBO = ['linha_cpf', 'linha_paciente'];

// Nomes dos campos que faltam no texto do modelo (antes da troca). `campos` é dados.campos.
function camposFaltandoNoModelo(textoModelo, campos) {
  const texto = String(textoModelo);
  const exigidos = CAMPOS_OBRIGATORIOS_RECIBO.concat(CAMPOS_CONDICIONAIS_RECIBO.filter((c) => campos[c] !== undefined && campos[c] !== ''));
  return exigidos.filter((c) => !texto.includes(`{{${c}}}`));
}

if (typeof module !== 'undefined') {
  module.exports = {
    CAMPOS_OBRIGATORIOS_RECIBO, CAMPOS_CONDICIONAIS_RECIBO, camposFaltandoNoModelo,
    FORMAS_COM_RECIBO, linhasModeloRecibo, textoSeguroParaDocs, nomeArquivoRecibo, dataBrasileira,
    montarDadosRecibo, camposSobrando,
  };
}
