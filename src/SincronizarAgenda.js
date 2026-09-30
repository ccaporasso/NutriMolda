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
// Linha antiga, sem marca de agenda, pertence à última agenda sincronizada (ou a esta, se nunca houve outra).
function lerConsultasExistentes_(origemAtual, origemLegado) {
  return lerAbaComoObjetos('Consultas').map((c) => ({
    linha: c.linha, id_evento: String(c.id_evento), data: String(c.data), hora: String(c.hora), tipo: String(c.tipo),
    codigo_paciente: String(c.codigo_paciente), status: String(c.status), atualizado_em: String(c.atualizado_em),
    origem: String(c.agenda_origem || ''), semMarca: String(c.agenda_origem || '') === '',
  })).filter((c) => c.id_evento !== '').map((c) => (c.semMarca ? { ...c, origem: origemLegado || origemAtual } : c));
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
    const origemAtual = marcaDaAgenda(cfg.calendario_id);
    const ultima = PropertiesService.getDocumentProperties().getProperty(CHAVE_ORIGEM_AGENDA);
    const existentes = lerConsultasExistentes_(origemAtual, ultima ? marcaDaAgenda(ultima) : '');
    const pacientes = lerPacientesParaAgenda_();
    const eventos = buscarEventosDaAgenda_(cfg.calendario_id, janela);
    const entrada = { existentes, pacientes, prefixo: cfg.prefixo_evento_consulta, janela, agoraTexto: agoraTexto_(), origemAtual };

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
    const colunaOrigem = ABAS.find((x) => x.nome === 'Consultas').cabecalho.indexOf('agenda_origem') + 1;
    const gravadas = new Set(plano.atualizar.map((x) => x.linha));
    // B1: entre a leitura e aqui houve chamadas à agenda (segundos). Se ela ordenou ou apagou linhas nesse meio-tempo,
    // o número da linha já não aponta para a mesma consulta: confere o id_evento de cada linha antes de gravar.
    const idsNaFolha = folha.getLastRow() >= 2 ? folha.getRange(1, 1, folha.getLastRow(), 1).getValues().map((l) => String(l[0])) : [];
    const aindaEhAMesma = (linha, id) => idsNaFolha[linha - 1] === String(id);
    let mudaram = 0;
    for (const a of plano.atualizar) {
      if (!aindaEhAMesma(a.linha, a.valores[0])) { mudaram++; continue; }
      const antiga = existentes.find((c) => c.linha === a.linha);
      folha.getRange(a.linha, 1, 1, a.valores.length + 1).setValues([a.valores.concat([antiga ? antiga.origem : origemAtual])]);
    }
    for (const c of existentes) { // linha antiga sem marca: passa a ter, sem mudar mais nada
      if (!c.semMarca || gravadas.has(c.linha)) continue;
      if (!aindaEhAMesma(c.linha, c.id_evento)) { mudaram++; continue; }
      folha.getRange(c.linha, colunaOrigem, 1, 1).setValues([[c.origem]]);
    }
    if (mudaram > 0) {
      plano.avisos.push(`${mudaram} linha(s) da aba Consultas mudaram de lugar durante a sincronização e não foram atualizadas desta vez. `
        + 'Nada foi gravado nelas; a próxima sincronização confere de novo.');
      registrar('sincronizacao', 'aviso', `Sincronização: ${mudaram} linha(s) mudaram de lugar durante a execução e ficaram para a próxima.`);
    }
    if (plano.inserir.length > 0) {
      const novas = plano.inserir.map((l) => l.concat([origemAtual]));
      adicionarLinhas('Consultas', novas);
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
  executarNoMenu_('sincronizacao', () => { // erro inesperado vai ao Registro e ao e-mail (B6)
    const jaTem = ScriptApp.getProjectTriggers().some((g) => g.getHandlerFunction() === NOME_GATILHO_SINCRONIZACAO);
    if (!jaTem) ScriptApp.newTrigger(NOME_GATILHO_SINCRONIZACAO).timeBased().everyHours(1).create();
    SpreadsheetApp.getUi().alert(jaTem
      ? 'A sincronização automática (a cada hora) já estava ativa. Nada foi duplicado.'
      : 'Pronto: a agenda será sincronizada a cada hora.');
  });
}

// Gatilho: falha vira Registro e e-mail de alerta.
function sincronizarAgendaAutomatica() {
  try {
    sincronizarAgenda();
  } catch (e) {
    if (!e || e.name !== 'ErroDeUso') { registrarErro('sincronizacao', e); return; }
    // Problema que ela mesma corrige: o Registro diz a causa (texto fixo) e o e-mail sai no máximo uma vez por dia por causa.
    const causa = causaDeUso(e);
    registrar('sincronizacao', causa === 'trava' ? 'info' : 'erro', CAUSAS_DE_USO[causa]);
    if (causa === 'trava') return;
    const propriedades = PropertiesService.getDocumentProperties();
    const chave = `alerta_sincronizacao_${causa}`;
    const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    if (propriedades.getProperty(chave) === hoje) return;
    propriedades.setProperty(chave, hoje);
    avisarPorEmail_('sincronizacao');
  }
}
