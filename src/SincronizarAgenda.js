// Sincronização agenda -> Consultas (chamadas ao Google). A lógica está em Agenda.js.
// Usa o Serviço Avançado "Calendar" (escopo calendar.events) só para LER os eventos.
// `sincronizarAgenda` não abre janelas: roda também pelo gatilho automático.

const NOME_GATILHO_SINCRONIZACAO = 'sincronizarAgendaAutomatica';

function hojeSaoPaulo_() {
  const agora = new Date();
  return {
    ano: Number(Utilities.formatDate(agora, FUSO_KIT, 'yyyy')),
    mes: Number(Utilities.formatDate(agora, FUSO_KIT, 'M')),
    dia: Number(Utilities.formatDate(agora, FUSO_KIT, 'd')),
  };
}

// Data e hora chegam como Date quando o Planilhas converteu a célula; volta para texto.
function celulaParaTexto_(valor, formato) {
  if (Object.prototype.toString.call(valor) === '[object Date]') return Utilities.formatDate(valor, FUSO_KIT, formato);
  return valor === undefined || valor === null ? '' : String(valor);
}

function lerConsultasExistentes_(folha) {
  if (folha.getLastRow() < 2) return [];
  const valores = folha.getRange(2, 1, folha.getLastRow() - 1, 7).getValues();
  return valores.map((l, i) => ({
    linha: i + 2,
    id_evento: String(l[0]),
    data: celulaParaTexto_(l[1], 'yyyy-MM-dd'),
    hora: celulaParaTexto_(l[2], 'HH:mm'),
    tipo: String(l[3]),
    codigo_paciente: String(l[4]),
    status: String(l[5]),
    atualizado_em: celulaParaTexto_(l[6], 'yyyy-MM-dd HH:mm:ss'),
  })).filter((c) => c.id_evento !== '');
}

function lerPacientesParaAgenda_(folha) {
  if (folha.getLastRow() < 2) return [];
  return folha.getRange(2, 1, folha.getLastRow() - 1, 8).getValues().map((l) => ({
    codigo: String(l[0]), telefone: String(l[3]), email: String(l[4]), ativo: l[7] !== false,
  })).filter((p) => p.codigo !== '');
}

function buscarEventosDaAgenda_(calendarioId, janela) {
  const itens = [];
  let pagina;
  do {
    const resposta = Calendar.Events.list(calendarioId, {
      timeMin: janela.timeMin, timeMax: janela.timeMax,
      singleEvents: true, showDeleted: true, maxResults: 250, pageToken: pagina,
    });
    for (const e of resposta.items || []) itens.push(e);
    pagina = resposta.nextPageToken;
  } while (pagina);
  return itens;
}

// Devolve o plano aplicado. Lança erro em português se as Configurações estiverem erradas.
function sincronizarAgenda() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw new Error('Outra sincronização está em andamento. Tente de novo em um minuto.');
  try {
    const cfg = lerConfiguracoes().config;
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const folha = planilha.getSheetByName('Consultas');
    const folhaPacientes = planilha.getSheetByName('Pacientes');
    if (!folha || !folhaPacientes) throw new Error('Faltam abas. Use o menu Kit do Consultório > Instalar/atualizar planilha.');

    const janela = calcularJanelaAgenda(hojeSaoPaulo_());
    const plano = planejarSincronizacaoAgenda({
      eventos: buscarEventosDaAgenda_(cfg.calendario_id, janela),
      existentes: lerConsultasExistentes_(folha),
      pacientes: lerPacientesParaAgenda_(folhaPacientes),
      prefixo: cfg.prefixo_evento_consulta,
      janela,
      agoraTexto: agoraTexto_(),
    });

    for (const a of plano.atualizar) folha.getRange(a.linha, 1, 1, a.valores.length).setValues([a.valores]);
    if (plano.inserir.length > 0) {
      folha.getRange(folha.getLastRow() + 1, 1, plano.inserir.length, plano.inserir[0].length).setValues(plano.inserir);
    }
    registrar('sincronizacao', 'info', `Sincronização: ${plano.inserir.length} nova(s), ${plano.atualizar.length} atualizada(s), `
      + `${plano.canceladas} cancelada(s), ${plano.aIdentificar.length} a identificar.`);
    return plano;
  } finally {
    trava.releaseLock();
  }
}

// Item do menu.
function sincronizarAgendaPeloMenu() {
  const plano = sincronizarAgenda();
  SpreadsheetApp.getUi().alert('Agenda sincronizada', resumirSincronizacao(plano), SpreadsheetApp.getUi().ButtonSet.OK);
}

// Cria o gatilho de hora em hora, uma única vez (idempotente). Escopo script.scriptapp.
function ativarSincronizacaoAutomatica() {
  const jaTem = ScriptApp.getProjectTriggers().some((g) => g.getHandlerFunction() === NOME_GATILHO_SINCRONIZACAO);
  if (!jaTem) ScriptApp.newTrigger(NOME_GATILHO_SINCRONIZACAO).timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert(jaTem
    ? 'A sincronização automática (a cada hora) já estava ativa. Nada foi duplicado.'
    : 'Pronto: a agenda será sincronizada a cada hora.');
}

// Gatilho: falha vira Registro e e-mail de alerta.
function sincronizarAgendaAutomatica() {
  try {
    sincronizarAgenda();
  } catch (e) {
    registrarErro('sincronizacao', e);
  }
}
