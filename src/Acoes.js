// Ações do menu sobre pagamentos e consultas (lógica pura, sem chamadas ao Google).
// Cada função devolve { ok: true, ... } com as linhas novas, ou { ok: false, motivo } em português.
// Nada é alterado aqui: quem grava é Menu.js. Motivos citam o id do pagamento, nunca nome, CPF ou chave Pix.

const FORMAS_DE_RECEBIMENTO_MANUAL = ['pix', 'cartao', 'dinheiro'];

function pixDeAcoes_() {
  return typeof gerarPixCopiaECola !== 'undefined' ? gerarPixCopiaECola : require('./Pix.js').gerarPixCopiaECola;
}

function recusa_(motivo) {
  return { ok: false, motivo };
}

function estadoDoPagamento_(p) {
  return { a_receber: 'a receber', pago: 'já está pago', cortesia: 'é cortesia' }[p.status] || 'com status inválido';
}

// hojeTexto = "AAAA-MM-DD". Só a partir de a_receber: pagamento já pago nunca é remarcado por engano.
function aplicarPagamentoRecebido(pagamento, forma, hojeTexto) {
  if (!FORMAS_DE_RECEBIMENTO_MANUAL.includes(forma)) return recusa_('Forma de pagamento inválida (use Pix, cartão ou dinheiro).');
  if (pagamento.status !== 'a_receber') return recusa_(`O pagamento ${pagamento.id} não pode ser marcado como pago: ${estadoDoPagamento_(pagamento)}.`);
  if (!Number.isSafeInteger(pagamento.valor_centavos) || pagamento.valor_centavos <= 0) {
    return recusa_(`O pagamento ${pagamento.id} está com valor inválido. Corrija a coluna valor_centavos antes de marcar como pago.`);
  }
  return { ok: true, pagamento: { ...pagamento, status: 'pago', forma, data_pagamento: hojeTexto } };
}

// Cortesia é escolha explícita (D17): valor vira zero e não entra no relatório.
function aplicarCortesia(pagamento) {
  if (pagamento.status !== 'a_receber') return recusa_(`O pagamento ${pagamento.id} não pode virar cortesia: ${estadoDoPagamento_(pagamento)}.`);
  return { ok: true, pagamento: { ...pagamento, status: 'cortesia', forma: 'cortesia', valor_centavos: 0, data_pagamento: '' } };
}

// Consulta de pacote: usa uma das consultas do pacote do paciente (a primeira com consulta sobrando).
// A consulta fica paga com valor zero: o dinheiro do pacote entrou na venda dele (D21).
function aplicarPacote(pagamento, pacotes, hojeTexto) {
  if (pagamento.status !== 'a_receber') return recusa_(`O pagamento ${pagamento.id} não pode usar pacote: ${estadoDoPagamento_(pagamento)}.`);
  const pacote = pacotes.find((p) => String(p.codigo_paciente) === String(pagamento.codigo_paciente)
    && Number.isSafeInteger(p.total_consultas) && Number.isSafeInteger(p.usadas) && p.usadas < p.total_consultas);
  if (!pacote) return recusa_(`O paciente do pagamento ${pagamento.id} não tem pacote com consulta sobrando. Cadastre ou renove na aba Pacotes.`);
  return {
    ok: true,
    pagamento: { ...pagamento, status: 'pago', forma: 'pacote', valor_centavos: 0, data_pagamento: hojeTexto },
    pacote: { ...pacote, usadas: pacote.usadas + 1 },
  };
}

// novoStatus: 'realizada' ou 'faltou'. Consulta cancelada não muda; realizada e faltou podem ser corrigidas uma pela outra.
function aplicarStatusConsulta(consulta, novoStatus) {
  if (!['realizada', 'faltou'].includes(novoStatus)) return recusa_('Status inválido.');
  if (consulta.status === 'cancelada') return recusa_('Consulta cancelada não pode ser marcada. Se ela voltou à agenda, sincronize de novo.');
  if (consulta.status === novoStatus) return recusa_(`A consulta já está como ${novoStatus}.`);
  return { ok: true, consulta: { ...consulta, status: novoStatus } };
}

// Pix copia e cola de um pagamento a receber. O texto sai da função pura de Pix.js (T06).
function montarPixDoPagamento(pagamento, config) {
  if (pagamento.status !== 'a_receber') return recusa_(`O pagamento ${pagamento.id} não está a receber (${estadoDoPagamento_(pagamento)}): não há Pix a gerar.`);
  try {
    const texto = pixDeAcoes_()({
      chave: config.chave_pix, nome: config.nome_recebedor_pix, cidade: config.cidade_recebedor_pix,
      valorCentavos: pagamento.valor_centavos, idTransacao: pagamento.id,
    });
    return { ok: true, texto };
  } catch (e) {
    return recusa_(e.message);
  }
}

function linhaPacoteAtualizada(p) {
  return [p.codigo_paciente, p.total_consultas, p.usadas, p.valor_centavos, p.inicio || ''];
}

if (typeof module !== 'undefined') {
  module.exports = {
    aplicarPagamentoRecebido, aplicarCortesia, aplicarPacote, aplicarStatusConsulta, montarPixDoPagamento,
    linhaPacoteAtualizada,
  };
}
