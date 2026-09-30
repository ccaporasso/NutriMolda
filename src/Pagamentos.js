// Valores a receber (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, fluxo 2. As chamadas ao Google estão em GerarAReceber.js.
// O valor sempre vem de `precoParaCobranca` (Configuracoes.js): preço ausente ou zero nunca vira cobrança (D17).

const STATUS_QUE_GERAM_COBRANCA = ['marcada', 'realizada'];

function precoPagamentos_() {
  return typeof precoParaCobranca !== 'undefined' ? precoParaCobranca : require('./Configuracoes.js').precoParaCobranca;
}

// PG000001, PG000002... O próximo número vem do maior já usado, então apagar uma linha não repete id.
function proximoNumeroPagamento(pagamentos) {
  let maior = 0;
  for (const p of pagamentos) {
    const m = /^PG(\d+)$/.exec(String(p.id));
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return maior + 1;
}

function idPagamento(numero) {
  return `PG${String(numero).padStart(6, '0')}`;
}

// Linha de Pagamentos na ordem do cabeçalho (11 colunas).
function linhaPagamento(p) {
  return [p.id, p.id_evento, p.codigo_paciente, p.pagador_nome || '', p.pagador_cpf || '',
    p.valor_centavos, p.forma || '', p.status, p.data_pagamento || '', p.link_recibo || '', p.pacote_inicio || ''];
}

// consultas: objetos de Consultas. pagamentos: objetos de Pagamentos. config: resultado de lerConfiguracoes().
// Devolve { novos, avisos, contagens }. Não cria nada por conta própria e não repete cobrança
// (uma consulta = um pagamento, achado pelo id_evento).
// Há consulta anterior (não cancelada) do mesmo paciente? Usada para não cobrar retorno como primeira consulta.
function temConsultaAnterior_(consultas, c) {
  const chave = `${c.data}${c.hora}`;
  return consultas.some((o) => o !== c && String(o.codigo_paciente) === String(c.codigo_paciente) && o.status !== 'cancelada'
    && `${o.data}${o.hora}` < chave);
}

function planejarAReceber({ consultas, pagamentos, config }) {
  const preco = precoPagamentos_();
  const idsComPagamento = new Set(pagamentos.map((p) => String(p.id_evento)).filter((x) => x !== ''));
  let numero = proximoNumeroPagamento(pagamentos);
  const contagens = { jaTinham: 0, semPaciente: 0, semTipo: 0, semPreco: 0, canceladasComCobranca: 0, semIdEvento: 0, idRepetido: 0, pagamentoSemConsulta: 0, primeiraComHistorico: 0 };
  const linhasPrimeiraComHistorico = [];
  const linhasSemId = [];
  const linhasRepetidas = [];
  const idsDeConsultas = new Set(consultas.map((c) => String(c.id_evento === undefined || c.id_evento === null ? '' : c.id_evento).trim()).filter((x) => x !== ''));
  contagens.pagamentoSemConsulta = pagamentos.filter((p) => String(p.id_evento).trim() !== '' && !idsDeConsultas.has(String(p.id_evento).trim())).length;
  const idsJaVistos = new Set();
  const semPrecoPorTipo = new Set();
  const novos = [];

  const ordenadas = consultas.slice().sort((a, b) => (`${a.data}${a.hora}`).localeCompare(`${b.data}${b.hora}`));
  for (const c of ordenadas) {
    const id = String(c.id_evento === undefined || c.id_evento === null ? '' : c.id_evento).trim();
    if (id === '') { // sem id_evento não há como ligar a cobrança à consulta: recusa em vez de cobrar de novo a cada execução
      if (c.status !== 'cancelada') { contagens.semIdEvento++; linhasSemId.push(c.linha); }
      continue;
    }
    if (idsJaVistos.has(id)) { contagens.idRepetido++; linhasRepetidas.push(c.linha); continue; }
    idsJaVistos.add(id);
    if (c.status === 'cancelada') {
      const aberto = pagamentos.some((p) => String(p.id_evento) === id && p.status === 'a_receber');
      if (aberto) contagens.canceladasComCobranca++;
      continue;
    }
    if (!STATUS_QUE_GERAM_COBRANCA.includes(c.status)) continue; // faltou: decisão dela, não do kit
    if (idsComPagamento.has(id)) { contagens.jaTinham++; continue; }
    if (!c.codigo_paciente) { contagens.semPaciente++; continue; }
    if (c.tipo === 'primeira' && temConsultaAnterior_(ordenadas, c)) { contagens.primeiraComHistorico++; linhasPrimeiraComHistorico.push(c.linha); continue; }
    let valor;
    try {
      valor = preco(config, c.tipo);
    } catch (e) {
      if (c.tipo === 'primeira' || c.tipo === 'retorno') { contagens.semPreco++; semPrecoPorTipo.add(c.tipo); } else contagens.semTipo++;
      continue;
    }
    novos.push({
      id: idPagamento(numero++), id_evento: id, codigo_paciente: String(c.codigo_paciente),
      valor_centavos: valor, status: 'a_receber',
    });
    idsComPagamento.add(id);
  }

  const avisos = [];
  const listaLinhas = (l) => l.filter((n) => n !== undefined).join(', ');
  if (contagens.semIdEvento > 0) {
    avisos.push(`${contagens.semIdEvento} consulta(s) sem "id_evento" não geraram cobrança${linhasSemId.some((n) => n !== undefined) ? ` (linha(s) ${listaLinhas(linhasSemId)} da aba Consultas)` : ''}. `
      + 'Rode "Sincronizar agenda" ou apague a linha incompleta e gere de novo.');
  }
  if (contagens.idRepetido > 0) {
    avisos.push(`${contagens.idRepetido} consulta(s) repetem um "id_evento" que já aparece acima${linhasRepetidas.some((n) => n !== undefined) ? ` (linha(s) ${listaLinhas(linhasRepetidas)} da aba Consultas)` : ''} e não geraram cobrança. Confira as linhas repetidas com o suporte antes de apagar qualquer uma: podem ser consultas diferentes.`);
  }
  if (contagens.pagamentoSemConsulta > 0) {
    avisos.push(`${contagens.pagamentoSemConsulta} pagamento(s) estão ligados a um "id_evento" que não existe na aba Consultas. Confira a aba Pagamentos.`);
  }
  if (contagens.primeiraComHistorico > 0) {
    avisos.push(`${contagens.primeiraComHistorico} consulta(s) estão como "primeira", mas o paciente já tem consulta anterior${linhasPrimeiraComHistorico.some((n) => n !== undefined) ? ` (linha(s) ${listaLinhas(linhasPrimeiraComHistorico)} da aba Consultas)` : ''}. `
      + 'Nenhuma cobrança foi criada para elas. Confira a coluna "tipo": se for retorno, troque para retorno e gere de novo.');
  }
  if (contagens.semPaciente > 0) {
    avisos.push(`${contagens.semPaciente} consulta(s) sem paciente identificado não geraram cobrança. Preencha "codigo_paciente" na aba Consultas e gere de novo.`);
  }
  for (const tipo of semPrecoPorTipo) {
    const chave = tipo === 'primeira' ? 'valor_primeira_consulta_centavos' : 'valor_retorno_centavos';
    avisos.push(`O preço ${tipo === 'primeira' ? 'da primeira consulta' : 'do retorno'} não está configurado: nenhuma cobrança desse tipo foi criada. `
      + `Preencha "${chave}" na aba Configurações (R$ 150,00 = 15000) ou marque a consulta como cortesia.`);
  }
  if (contagens.semTipo > 0) avisos.push(`${contagens.semTipo} consulta(s) com tipo inválido não geraram cobrança. Use primeira ou retorno.`);
  if (contagens.canceladasComCobranca > 0) {
    avisos.push(`${contagens.canceladasComCobranca} consulta(s) cancelada(s) ainda têm valor a receber. Revise na aba Pagamentos (marque como cortesia se não for cobrar).`);
  }
  return { novos, avisos, contagens };
}

function resumirAReceber(plano) {
  const linhas = [
    `Cobranças novas: ${plano.novos.length}. Consultas que já tinham cobrança: ${plano.contagens.jaTinham}.`,
  ];
  return linhas.concat(plano.avisos).join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = {
    STATUS_QUE_GERAM_COBRANCA, proximoNumeroPagamento, idPagamento, linhaPagamento, planejarAReceber, resumirAReceber,
  };
}
