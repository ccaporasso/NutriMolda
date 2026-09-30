// Recibo em PDF (lógica pura, sem chamadas ao Google). A parte do Google está em ReciboPdf.js.
// Campos exigidos: docs/ESPECIFICACAO.md, "O recibo". Nenhum dado de saúde: só o código no nome do arquivo.

function formatosRecibo_() {
  return typeof formatarReais !== 'undefined'
    ? { formatarReais, cpfValido, formatarCpf }
    : require('./Formatos.js');
}

// Marcadores que o modelo do Google Docs precisa ter (escritos assim, com chaves duplas).
const MARCADORES_OBRIGATORIOS_RECIBO = [
  'nome_profissional', 'crn', 'pagador_nome', 'valor', 'data_pagamento', 'descricao',
];
// Marcadores extras que o modelo pode ter; quando não se aplicam, ficam em branco.
const MARCADORES_OPCIONAIS_RECIBO = ['numero', 'data_emissao', 'pagador_cpf_linha', 'paciente_linha'];

const DESCRICAO_PADRAO_RECIBO = 'Consulta de nutrição';

// "2026-09-30" -> "30/09/2026" (texto que não é data devolve vazio).
function dataParaReciboBr(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function semAcentoMinusculo_(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// Pagador e paciente são a mesma pessoa? Primeiro nome igual e sobrenome começando pela inicial guardada.
function pagadorEhOPaciente(pagadorNome, paciente) {
  if (!paciente) return false;
  const partes = semAcentoMinusculo_(pagadorNome).split(/\s+/).filter(Boolean);
  if (partes.length === 0) return false;
  const primeiro = semAcentoMinusculo_(paciente.primeiro_nome);
  const inicial = semAcentoMinusculo_(paciente.inicial_sobrenome).replace(/\./g, '').slice(0, 1);
  if (partes[0] !== primeiro) return false;
  return !inicial || (partes.length > 1 && partes[partes.length - 1].startsWith(inicial));
}

// Nome do arquivo: só código do paciente, data e id do pagamento (regra 6). Nunca nome nem CPF.
function nomeArquivoRecibo(pagamento, dataPagamento) {
  const parte = (t) => String(t || '').replace(/[^A-Za-z0-9-]/g, '');
  return `Recibo_${parte(pagamento.codigo_paciente)}_${parte(dataPagamento)}_${parte(pagamento.id)}.pdf`;
}

// Junta e confere tudo o que o recibo precisa.
// entrada: { config, pagamento, paciente|null, consulta|null, hoje: "AAAA-MM-DD" }
// Devolve { erros: [...] } ou { campos: { marcador: texto }, nomeArquivo }.
function montarDadosRecibo(entrada) {
  const { config, pagamento, paciente, consulta, hoje } = entrada;
  const F = formatosRecibo_();
  const erros = [];
  const p = pagamento || {};

  if (String(p.status) !== 'pago') {
    erros.push('Só se gera recibo de pagamento marcado como "pago". Marque como pago antes.');
  }
  if (!config.nome_profissional) erros.push('Preencha "nome_profissional" na aba Configurações: ele aparece no recibo.');
  if (!config.crn) erros.push('Preencha "crn" na aba Configurações: ele aparece no recibo.');
  if (!String(p.pagador_nome || '').trim()) erros.push('Preencha o nome de quem pagou (coluna pagador_nome) na aba Pagamentos.');
  if (!Number.isSafeInteger(p.valor_centavos) || p.valor_centavos <= 0) {
    erros.push('O valor deste pagamento está vazio ou inválido (coluna valor_centavos, em centavos).');
  }
  const dataPagamento = dataParaReciboBr(p.data_pagamento);
  if (!dataPagamento) erros.push('Preencha a data do pagamento (coluna data_pagamento, no formato 2026-09-30).');

  const cpf = String(p.pagador_cpf || '').trim();
  if (cpf && !F.cpfValido(cpf)) erros.push('O CPF do pagador (coluna pagador_cpf) não é válido. Corrija ou deixe em branco.');

  if (erros.length > 0) return { erros };

  const dataConsulta = consulta ? dataParaReciboBr(consulta.data) : '';
  return {
    campos: {
      nome_profissional: config.nome_profissional,
      crn: config.crn,
      pagador_nome: String(p.pagador_nome).trim(),
      pagador_cpf_linha: cpf ? `CPF: ${F.formatarCpf(cpf)}` : '',
      paciente_linha: !pagadorEhOPaciente(p.pagador_nome, paciente) && paciente
        ? `Paciente: ${[paciente.primeiro_nome, paciente.inicial_sobrenome].filter(Boolean).join(' ')}` : '',
      valor: F.formatarReais(p.valor_centavos),
      data_pagamento: dataPagamento,
      descricao: dataConsulta ? `${DESCRICAO_PADRAO_RECIBO} realizada em ${dataConsulta}` : DESCRICAO_PADRAO_RECIBO,
      numero: String(p.id || ''),
      data_emissao: dataParaReciboBr(hoje),
    },
    nomeArquivo: nomeArquivoRecibo(p, String(p.data_pagamento)),
  };
}

// Obrigatórios que o texto do modelo não traz. Devolve a lista dos que faltam.
function marcadoresFaltandoNoModelo(textoModelo) {
  return MARCADORES_OBRIGATORIOS_RECIBO.filter((m) => !String(textoModelo).includes(`{{${m}}}`));
}

function textoErrosRecibo(erros) {
  return `Não foi possível gerar o recibo:\n- ${erros.join('\n- ')}`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    MARCADORES_OBRIGATORIOS_RECIBO, MARCADORES_OPCIONAIS_RECIBO, dataParaReciboBr,
    pagadorEhOPaciente, nomeArquivoRecibo, montarDadosRecibo, marcadoresFaltandoNoModelo, textoErrosRecibo,
  };
}
