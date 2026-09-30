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

const CHAVE_ORIGEM_AGENDA = 'calendario_da_ultima_sincronizacao';
const MAX_CONFERENCIAS_AGENDA = 40; // consultas ausentes conferidas uma a uma por execução

// Consultas como objetos (já com data e hora em texto). Cabeçalho conferido em lerAbaComoObjetos.
function lerConsultasExistentes_() {
  return lerAbaComoObjetos('Consultas').map((c) => ({
    linha: c.linha, id_evento: String(c.id_evento), data: String(c.data), hora: String(c.hora), tipo: String(c.tipo),
    codigo_paciente: String(c.codigo_paciente), status: String(c.status), atualizado_em: String(c.atualizado_em),
  })).filter((c) => c.id_evento !== '');
}

function lerPacientesParaAgenda_() {
  return lerAbaComoObjetos('Pacientes').map((p) => ({
    codigo: String(p.codigo), telefone: String(p.telefone), email: String(p.email), ativo: p.ativo !== false,
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

// A agenda mudou desde a última sincronização? Só compara com o que ficou guardado; a primeira vez não conta.
function agendaMudou_(calendarioId) {
  const guardado = PropertiesService.getDocumentProperties().getProperty(CHAVE_ORIGEM_AGENDA);
  return guardado !== null && guardado !== undefined && guardado !== calendarioId;
}

// Confere, uma a uma, as consultas que não vieram na leitura. Só um evento devolvido pela agenda
// (mesmo que apagado ou remarcado) vale como resposta: erro de acesso ou "não achei" não cancela nada (R04).
function conferirAusentes_(calendarioId, ids) {
  const respostas = [];
  for (const id of ids.slice(0, MAX_CONFERENCIAS_AGENDA)) {
    try {
      const ev = Calendar.Events.get(calendarioId, id);
      if (ev && ev.id) respostas.push(ev);
    } catch (e) {
      // sem resposta da agenda: a consulta continua marcada e entra no aviso
    }
  }
  return { respostas };
}

// Devolve o plano aplicado. Lança erro em português se as Configurações estiverem erradas.
function sincronizarAgenda() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw erroDeUso_('Outra sincronização está em andamento. Tente de novo em um minuto.');
  try {
    const cfg = lerConfiguracoes().config;
    const janela = calcularJanelaAgenda(hojeSaoPaulo_());
    const existentes = lerConsultasExistentes_();
    const pacientes = lerPacientesParaAgenda_();
    const mudou = agendaMudou_(cfg.calendario_id);
    const eventos = buscarEventosDaAgenda_(cfg.calendario_id, janela);
    const entrada = { existentes, pacientes, prefixo: cfg.prefixo_evento_consulta, janela, agoraTexto: agoraTexto_(), agendaMudou: mudou };

    let plano = planejarSincronizacaoAgenda({ ...entrada, eventos });
    if (plano.ausentes.length > 0) {
      const { respostas } = conferirAusentes_(cfg.calendario_id, plano.ausentes);
      plano = planejarSincronizacaoAgenda({ ...entrada, eventos: eventos.concat(respostas) });
      if (plano.ausentes.length > 0) {
        plano.avisos.push(`${plano.ausentes.length} consulta(s) marcada(s) não apareceram na leitura da agenda e não foi possível confirmar se foram apagadas. `
          + 'Nada foi cancelado por isso; confira na aba Consultas e na agenda.');
      }
    }

    const folha = abrirFolhaConferida_('Consultas').folha;
    for (const a of plano.atualizar) folha.getRange(a.linha, 1, 1, a.valores.length).setValues([a.valores]);
    if (plano.inserir.length > 0) {
      folha.getRange(folha.getLastRow() + 1, 1, plano.inserir.length, plano.inserir[0].length).setValues(plano.inserir);
    }
    PropertiesService.getDocumentProperties().setProperty(CHAVE_ORIGEM_AGENDA, String(cfg.calendario_id));
    registrar('sincronizacao', 'info', `Sincronização: ${plano.inserir.length} nova(s), ${plano.atualizar.length} atualizada(s), `
      + `${plano.canceladas} cancelada(s), ${plano.aIdentificar.length} a identificar.`);
    return plano;
  } finally {
    trava.releaseLock();
  }
}

// Item do menu.
function sincronizarAgendaPeloMenu() {
  executarNoMenu_('sincronizacao', () => {
    const plano = sincronizarAgenda();
    SpreadsheetApp.getUi().alert('Agenda sincronizada', resumirSincronizacao(plano), SpreadsheetApp.getUi().ButtonSet.OK);
  });
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
