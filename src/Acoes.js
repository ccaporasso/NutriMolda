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
function textoParaDataAcoes_(texto) {
  return typeof textoParaData !== 'undefined' ? textoParaData(texto) : require('./Formatos.js').textoParaData(texto);
}

function pacoteUtilizavel_(p) {
  return textoParaDataAcoes_(String(p.inicio || '')) !== null && Number.isSafeInteger(p.total_consultas) && Number.isSafeInteger(p.usadas)
    && p.total_consultas >= 0 && p.usadas >= 0;
}

// Só o pacote VIGENTE do paciente (o de `inicio` mais recente) pode ser usado. O pagamento guarda o `inicio` do pacote
// gasto (coluna pacote_inicio): a identidade do pacote é (paciente, inicio) e nunca é deduzida por datas depois.
// Início inválido ou igual em dois pacotes, início no futuro ou vigente sem saldo recusam antes de qualquer gravação (R11).
function pacoteVigente_(pagamento, pacotes, hojeTexto) {
  const semSaldo = recusa_(`O paciente do pagamento ${pagamento.id} não tem pacote com consulta sobrando. Cadastre ou renove na aba Pacotes.`);
  const doPaciente = pacotes.filter((p) => String(p.codigo_paciente) === String(pagamento.codigo_paciente));
  if (doPaciente.length === 0) return semSaldo;
  const invalido = doPaciente.find((p) => !pacoteUtilizavel_(p));
  if (invalido) return recusa_(`Há pacote do paciente do pagamento ${pagamento.id} com "inicio" (data AAAA-MM-DD real) ou números inválidos na aba Pacotes (linha ${invalido.linha || '?'}). Corrija antes de usar.`);
  const maior = doPaciente.reduce((m, p) => (String(p.inicio) > m ? String(p.inicio) : m), '');
  const vigentes = doPaciente.filter((p) => String(p.inicio) === maior);
  if (vigentes.length > 1) return recusa_(`O paciente do pagamento ${pagamento.id} tem mais de um pacote com o mesmo início. Deixe só um, ou corrija o "inicio" na aba Pacotes.`);
  if (maior > hojeTexto) return recusa_(`O pacote do paciente do pagamento ${pagamento.id} começa depois de hoje. Confira o "inicio" na aba Pacotes.`);
  const p = vigentes[0];
  if (p.usadas >= p.total_consultas) return semSaldo;
  return { ok: true, pacote: p };
}

function aplicarPacote(pagamento, pacotes, hojeTexto) {
  if (pagamento.status !== 'a_receber') return recusa_(`O pagamento ${pagamento.id} não pode usar pacote: ${estadoDoPagamento_(pagamento)}.`);
  const v = pacoteVigente_(pagamento, pacotes, hojeTexto);
  if (!v.ok) return v;
  return {
    ok: true,
    pagamento: { ...pagamento, status: 'pago', forma: 'pacote', valor_centavos: 0, data_pagamento: hojeTexto, pacote_inicio: String(v.pacote.inicio) },
    pacote: { ...v.pacote, usadas: v.pacote.usadas + 1 },
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

// Consultas já pagas por pacote (pago + forma pacote) de cada pacote, contadas pelo `pacote_inicio` gravado no próprio pagamento.
// Serve para reconciliar `usadas` depois de uma falha entre as duas gravações (R11): o pagamento é gravado primeiro, então
// nunca falta uma consulta contada a mais, só a menos. Pagamento de pacote sem `pacote_inicio` (versão antiga) não é atribuído
// a ninguém e pacotes com o mesmo paciente e início não são corrigidos (ambíguos).
function consumidasPorPacote(pacotes, pagamentos) {
  return pacotes.map((p) => {
    const codigo = String(p.codigo_paciente);
    const inicio = String(p.inicio || '');
    if (inicio === '' || pacotes.filter((x) => String(x.codigo_paciente) === codigo && String(x.inicio || '') === inicio).length > 1) return 0;
    return pagamentos.filter((g) => String(g.codigo_paciente) === codigo && g.status === 'pago' && g.forma === 'pacote'
      && String(g.pacote_inicio || '') === inicio).length;
  });
}

// Devolve { pacotes, corrigidos, excedentes }: `usadas` sobe até o número de consultas pagas por pacote, nunca desce e nunca passa
// de `total_consultas` (propriedade 0 <= usadas <= total, docs/MATRIZ-INTEGRIDADE.md). `corrigidos` são os pacotes cuja coluna
// `usadas` precisa ser regravada. `excedentes` são os pacotes com MAIS consultas pagas do que o total: o kit não grava um valor
// impossível nem esconde o excesso, e quem chama avisa a nutricionista. Pacote com total inválido não é mexido.
function reconciliarPacotes(pacotes, pagamentos) {
  const consumidas = consumidasPorPacote(pacotes, pagamentos);
  const corrigidos = [];
  const excedentes = [];
  const resultado = pacotes.map((p, i) => {
    if (!Number.isSafeInteger(p.usadas) || !Number.isSafeInteger(p.total_consultas) || p.total_consultas < 0 || consumidas[i] <= p.usadas) return p;
    if (consumidas[i] > p.total_consultas) excedentes.push({ ...p, consumidas: consumidas[i] });
    const alvo = Math.min(consumidas[i], p.total_consultas);
    if (alvo <= p.usadas) return p;
    const novo = { ...p, usadas: alvo };
    corrigidos.push(novo);
    return novo;
  });
  return { pacotes: resultado, corrigidos, excedentes };
}

function linhaPacoteAtualizada(p) {
  return [p.codigo_paciente, p.total_consultas, p.usadas, p.valor_centavos, p.inicio || ''];
}

if (typeof module !== 'undefined') {
  module.exports = {
    aplicarPagamentoRecebido, aplicarCortesia, aplicarPacote, aplicarStatusConsulta, montarPixDoPagamento,
    linhaPacoteAtualizada, consumidasPorPacote, reconciliarPacotes,
  };
}
