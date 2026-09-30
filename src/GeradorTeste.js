// Gerador de dados de TESTE (chamadas ao Google). A lógica está em DadosTeste.js.
// Usa o Serviço Avançado "Calendar" (escopo calendar.events) e só a agenda secundária
// indicada em `calendario_id`; nunca a agenda principal.

const ABAS_DA_LIMPEZA_DE_TESTE = ['Pacientes', 'Consultas', 'Pagamentos', 'Pacotes'];

// Chamada por onOpen (Menu.js) só quando este arquivo existe: na produção o submenu de teste nem aparece.
function adicionarMenuDeTeste_(ui, menu) {
  menu.addSubMenu(ui.createMenu('Somente na conta de TESTE')
    .addItem('TESTE: criar dados fictícios', 'criarDadosDeTeste')
    .addItem('TESTE: apagar dados fictícios', 'apagarDadosDeTeste'));
}

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

  const existentes = lerAbaComoObjetos('Pacientes');
  const colisoes = codigosEmColisao(existentes);
  if (colisoes.length > 0) {
    throw new Error(`Os códigos ${colisoes.join(', ')} já existem na aba Pacientes com outros dados. `
      + 'O gerador não mistura dados de teste com esses: nada foi criado. Use outros códigos ou apague essas linhas à mão.');
  }
  const novas = pacientesQueFaltam(existentes.map((p) => String(p.codigo)));
  adicionarLinhas('Pacientes', novas);

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
  if (!confirmar_('Vai apagar só os pacientes de teste gerados pelo kit (P9001 a P9006) e o que está ligado a eles em Consultas, Pagamentos e Pacotes, '
    + 'além dos eventos de teste da agenda de teste. Dados reais não são tocados. Continuar?')) return;

  const plano = planejarLimpezaDeTeste({
    pacientes: lerAbaComoObjetos('Pacientes'), consultas: lerAbaComoObjetos('Consultas'),
    pagamentos: lerAbaComoObjetos('Pagamentos'), pacotes: lerAbaComoObjetos('Pacotes'),
  });
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let linhasApagadas = 0;
  for (const aba of ABAS_DA_LIMPEZA_DE_TESTE) {
    const folha = planilha.getSheetByName(aba);
    for (const linha of plano[aba]) {
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
