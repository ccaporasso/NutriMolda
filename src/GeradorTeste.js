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

// O sufixo de agenda secundária não prova que a agenda é de teste (R03): a primeira vez para cada agenda, ela precisa
// dizer que é só de teste. A resposta fica guardada nas propriedades do documento, junto com o id dessa agenda.
const CHAVE_AGENDA_DE_TESTE = 'agenda_de_teste_confirmada';
const CHAVE_EVENTOS_GERADOS = 'agenda_com_eventos_de_teste_gerados'; // agenda onde o gerador já criou os nove eventos

function confirmarAgendaDeTeste_(calendarioId) {
  const propriedades = PropertiesService.getDocumentProperties();
  if (propriedades.getProperty(CHAVE_AGENDA_DE_TESTE) === calendarioId) return;
  const ui = SpreadsheetApp.getUi();
  const resposta = ui.alert('Esta agenda é só de TESTE?',
    'O kit vai criar e apagar eventos inventados na agenda cujo ID está em "calendario_id". Responda Sim apenas se ela foi criada só para teste '
    + 'e NÃO tem consultas de verdade. Na dúvida, responda Não.', ui.ButtonSet.YES_NO);
  if (resposta !== ui.Button.YES) throw erroDeUso_('Nada foi feito: a agenda não foi confirmada como agenda de teste.');
  propriedades.setProperty(CHAVE_AGENDA_DE_TESTE, calendarioId);
}

function calendarioDeTeste_() {
  const cfg = lerConfiguracoes().config;
  const id = cfg.calendario_id;
  const validacao = validarAgendaDeTeste(id);
  if (!validacao.ok) throw erroDeUso_(validacao.erro);
  confirmarAgendaDeTeste_(id);
  return { id, prefixo: cfg.prefixo_evento_consulta || 'Consulta' };
}

function confirmar_(texto) {
  const ui = SpreadsheetApp.getUi();
  return ui.alert('Dados de TESTE', texto, ui.ButtonSet.OK_CANCEL) === ui.Button.OK;
}

// Itens do menu de teste: erro inesperado vai ao Registro e ao e-mail; a gravação roda com a trava, para não se
// cruzar com a sincronização automática, que grava pelo número da linha (B6).
function criarDadosDeTeste() {
  comRegistroDeFalha_('teste', () => {
    const { id, prefixo } = calendarioDeTeste_();
    if (!confirmar_('Vai criar pacientes e eventos INVENTADOS na agenda de teste. Continuar?')) return;
    comTrava_(() => criarDadosDeTesteNaAgenda_(id, prefixo));
  });
}

function criarDadosDeTesteNaAgenda_(id, prefixo) {

  // Tudo é conferido ANTES de escrever qualquer coisa (R03h): pacientes com código já usado e eventos com id já ocupado.
  const existentes = lerAbaComoObjetos('Pacientes');
  const colisoes = codigosEmColisao(existentes);
  if (colisoes.length > 0) {
    throw erroDeUso_(`Os códigos ${colisoes.join(', ')} já existem na aba Pacientes com outros dados. `
      + 'O gerador não mistura dados de teste com esses: nada foi criado. Use outros códigos ou apague essas linhas à mão.');
  }
  const propriedades = PropertiesService.getDocumentProperties();
  const geradoAqui = propriedades.getProperty(CHAVE_EVENTOS_GERADOS) === id; // o kit já criou os nove eventos nesta agenda
  const hoje = new Date();
  const dataHoje = {
    ano: Number(Utilities.formatDate(hoje, 'America/Sao_Paulo', 'yyyy')),
    mes: Number(Utilities.formatDate(hoje, 'America/Sao_Paulo', 'M')),
    dia: Number(Utilities.formatDate(hoje, 'America/Sao_Paulo', 'd')),
  };
  const plano = [];
  let alheios = 0;
  for (const e of montarEventosTeste(dataHoje, prefixo)) {
    let existente = null;
    try {
      existente = Calendar.Events.get(id, e.id);
    } catch (erro) {
      if (!eventoAusenteConfirmado(erro)) {
        throw new Error('Não foi possível conferir se os eventos de teste já existem na agenda (erro de leitura). Nada foi criado. Tente de novo em alguns minutos.');
      }
    }
    const marcado = !!(existente && existente.extendedProperties && existente.extendedProperties.private
      && existente.extendedProperties.private[MARCA_TESTE] === '1');
    if (existente && !geradoAqui && !marcado) { alheios++; continue; }
    plano.push({ e, existente });
  }
  if (alheios > 0) {
    throw erroDeUso_(`${alheios} evento(s) já ocupam os ids que o gerador usaria nesta agenda e não há prova de que foram criados por ele. `
      + 'Nada foi criado. Use uma agenda de teste nova, vazia.');
  }

  const novas = pacientesQueFaltam(existentes.map((p) => String(p.codigo)));
  adicionarLinhas('Pacientes', novas);
  let criados = 0;
  for (const { e, existente } of plano) {
    const corpo = {
      id: e.id,
      summary: e.titulo,
      description: e.descricao,
      start: { dateTime: e.inicio, timeZone: e.fuso },
      end: { dateTime: e.fim, timeZone: e.fuso },
      extendedProperties: { private: e.marca },
      status: 'confirmed',
    };
    if (existente && existente.status !== 'cancelled') continue; // já existe (criado por ele): não duplica
    if (existente) Calendar.Events.update(corpo, id, e.id); // apagado antes por ele: reativa
    else Calendar.Events.insert(corpo, id);
    criados++;
  }
  propriedades.setProperty(CHAVE_EVENTOS_GERADOS, id);
  SpreadsheetApp.getUi().alert(`Pacientes de teste novos: ${novas.length}. Eventos criados: ${criados}.`);
}

function apagarDadosDeTeste() {
  comRegistroDeFalha_('teste', () => {
    const { id } = calendarioDeTeste_();
    if (!confirmar_('Vai apagar só os pacientes de teste gerados pelo kit (P9001 a P9006) e as consultas e pagamentos que o kit comprova serem de teste. '
      + 'Pacotes e linhas sem comprovação de origem ficam. Também apaga os eventos de teste da agenda de teste. Dados reais não são tocados. Continuar?')) return;
    comTrava_(() => apagarDadosDeTesteDaAgenda_(id));
  });
}

function apagarDadosDeTesteDaAgenda_(id) {

  const consultas = lerAbaComoObjetos('Consultas').map((c) => ({ ...c, origem: String(c.agenda_origem || '') }));
  const origemTeste = marcaDaAgenda(id);
  const plano = planejarLimpezaDeTeste({
    pacientes: lerAbaComoObjetos('Pacientes'), consultas, pagamentos: lerAbaComoObjetos('Pagamentos'), origemTeste,
  });
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const preservadas = contarPreservadasSemProva(consultas, origemTeste);
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
  SpreadsheetApp.getUi().alert(`Linhas apagadas: ${linhasApagadas}. Eventos apagados: ${eventosApagados}.`
    + (preservadas ? ` ${preservadas} consulta(s) de versão antiga ficaram, pois não há como provar que são de teste; apague à mão se forem.` : ''));
}
