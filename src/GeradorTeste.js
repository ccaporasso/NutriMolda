// Gerador de dados de TESTE (chamadas ao Google). A lógica está em DadosTeste.js.
// Usa o Serviço Avançado "Calendar" (escopo calendar.events) e só a agenda secundária
// indicada em `calendario_id`; nunca a agenda principal.

const ABAS_COM_CODIGO = [
  { aba: 'Pacientes', coluna: 'codigo' },
  { aba: 'Consultas', coluna: 'codigo_paciente' },
  { aba: 'Pagamentos', coluna: 'codigo_paciente' },
  { aba: 'Pacotes', coluna: 'codigo_paciente' },
];

function calendarioDeTeste_() {
  const cfg = lerConfiguracoes().config;
  const id = cfg.calendario_id;
  const validacao = validarAgendaDeTeste(id);
  if (!validacao.ok) throw new Error(validacao.erro);
  return { id, prefixo: cfg.prefixo_evento_consulta || 'Consulta' };
}

function confirmar_(texto) {
  const ui = SpreadsheetApp.getUi();
  return ui.alert('Dados de TESTE', texto, ui.ButtonSet.OK_CANCEL) === ui.Button.OK;
}

function criarDadosDeTeste() {
  const { id, prefixo } = calendarioDeTeste_();
  if (!confirmar_('Vai criar pacientes e eventos INVENTADOS na agenda de teste. Continuar?')) return;

  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const folha = planilha.getSheetByName('Pacientes');
  const codigos = folha.getLastRow() > 1
    ? folha.getRange(2, 1, folha.getLastRow() - 1, 1).getValues().map((l) => String(l[0]))
    : [];
  const novas = pacientesQueFaltam(codigos);
  if (novas.length > 0) {
    folha.getRange(folha.getLastRow() + 1, 1, novas.length, novas[0].length).setValues(novas);
  }

  const hoje = new Date();
  const dataHoje = {
    ano: Number(Utilities.formatDate(hoje, 'America/Sao_Paulo', 'yyyy')),
    mes: Number(Utilities.formatDate(hoje, 'America/Sao_Paulo', 'M')),
    dia: Number(Utilities.formatDate(hoje, 'America/Sao_Paulo', 'd')),
  };
  let criados = 0;
  for (const e of montarEventosTeste(dataHoje, prefixo)) {
    const corpo = {
      id: e.id,
      summary: e.titulo,
      description: e.descricao,
      start: { dateTime: e.inicio, timeZone: e.fuso },
      end: { dateTime: e.fim, timeZone: e.fuso },
      extendedProperties: { private: e.marca },
      status: 'confirmed',
    };
    let existente = null;
    try { existente = Calendar.Events.get(id, e.id); } catch (erro) { existente = null; }
    if (existente && existente.status !== 'cancelled') continue; // já existe: não duplica
    if (existente) Calendar.Events.update(corpo, id, e.id); // apagado antes: reativa
    else Calendar.Events.insert(corpo, id);
    criados++;
  }
  SpreadsheetApp.getUi().alert(`Pacientes de teste novos: ${novas.length}. Eventos criados: ${criados}.`);
}

function apagarDadosDeTeste() {
  const { id } = calendarioDeTeste_();
  if (!confirmar_('Vai apagar os pacientes P9xxx (e suas linhas em Consultas, Pagamentos e Pacotes) '
    + 'e os eventos de teste da agenda de teste. Dados reais não são tocados. Continuar?')) return;

  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let linhasApagadas = 0;
  for (const { aba, coluna } of ABAS_COM_CODIGO) {
    const folha = planilha.getSheetByName(aba);
    if (!folha || folha.getLastRow() < 2) continue;
    const posicao = ABAS.find((a) => a.nome === aba).cabecalho.indexOf(coluna) + 1;
    const valores = folha.getRange(1, posicao, folha.getLastRow(), 1).getValues().map((l) => l[0]);
    for (const linha of linhasParaApagar(valores, ehCodigoDeTeste)) {
      folha.deleteRow(linha);
      linhasApagadas++;
    }
  }

  let eventosApagados = 0;
  let pagina;
  do {
    const resposta = Calendar.Events.list(id, {
      privateExtendedProperty: `${MARCA_TESTE}=1`,
      showDeleted: false,
      maxResults: 250,
      pageToken: pagina,
    });
    for (const ev of resposta.items || []) {
      Calendar.Events.remove(id, ev.id);
      eventosApagados++;
    }
    pagina = resposta.nextPageToken;
  } while (pagina);
  SpreadsheetApp.getUi().alert(`Linhas apagadas: ${linhasApagadas}. Eventos apagados: ${eventosApagados}.`);
}
