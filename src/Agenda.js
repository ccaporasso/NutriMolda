// Sincronização agenda -> Consultas (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, fluxo 1. As chamadas ao Google estão em SincronizarAgenda.js.
// Nada aqui grava nome, título nem descrição do evento: só id, data, hora, tipo e código.

const DIAS_PASSADO_AGENDA = 30; // quanto para trás a sincronização olha
const DIAS_BUSCA_FUTURO_AGENDA = 120; // até onde os eventos são lidos
const DIAS_VERIFICA_FUTURO_AGENDA = 90; // até onde "sumiu da agenda" vale como cancelamento

function formatosAgenda_() {
  return typeof dataHoraLocal !== 'undefined'
    ? { dataHoraLocal, somarDiasNaData, dataParaTexto }
    : require('./Formatos.js');
}

// hoje = { ano, mes, dia }. Devolve os textos que a camada do Google usa.
function calcularJanelaAgenda(hoje) {
  const f = formatosAgenda_();
  const de = f.dataParaTexto(f.somarDiasNaData(hoje, -DIAS_PASSADO_AGENDA));
  const ate = f.dataParaTexto(f.somarDiasNaData(hoje, DIAS_BUSCA_FUTURO_AGENDA));
  return {
    timeMin: `${de}T00:00:00-03:00`,
    timeMax: `${ate}T00:00:00-03:00`,
    verificarDe: de,
    verificarAte: f.dataParaTexto(f.somarDiasNaData(hoje, DIAS_VERIFICA_FUTURO_AGENDA)),
  };
}

// Marca curta e estável do calendario_id (não guarda o id na planilha). Começa com letra para não virar número.
function marcaDaAgenda(calendarioId) {
  let h = 5381;
  for (const c of String(calendarioId)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return `a${h.toString(16).padStart(8, '0')}`;
}

// Só letras e números; 55 na frente (Brasil) é ignorado.
function normalizarTelefoneAgenda(texto) {
  let d = String(texto === undefined || texto === null ? '' : texto).replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}

// E-mails e telefones que aparecem na lista de convidados e na descrição do evento.
function contatosDoEvento(evento) {
  const emails = new Set();
  const telefones = new Set();
  for (const convidado of evento.attendees || []) {
    if (convidado && typeof convidado.email === 'string') emails.add(convidado.email.trim().toLowerCase());
  }
  const descricao = typeof evento.description === 'string' ? evento.description : '';
  for (const e of descricao.match(/[^\s@<>,;:()]+@[^\s@<>,;:()]+\.[^\s@<>,;:()]+/g) || []) {
    emails.add(e.toLowerCase());
  }
  for (const t of descricao.match(/\+?\d[\d ().-]{8,}\d/g) || []) {
    const n = normalizarTelefoneAgenda(t);
    if (n.length >= 10) telefones.add(n);
  }
  return { emails, telefones };
}

// Devolve o código do paciente, ou null se ninguém bate ou se mais de um paciente bate.
// Paciente marcado com ativo = false não entra.
function identificarPacienteAgenda(evento, pacientes) {
  const { emails, telefones } = contatosDoEvento(evento);
  const achados = new Set();
  for (const p of pacientes) {
    if (p.ativo === false) continue;
    const email = String(p.email || '').trim().toLowerCase();
    const tel = normalizarTelefoneAgenda(p.telefone);
    if ((email && emails.has(email)) || (tel.length >= 10 && telefones.has(tel))) achados.add(String(p.codigo));
  }
  return achados.size === 1 ? [...achados][0] : null;
}

function ehEventoDeConsulta(evento, prefixo) {
  const titulo = typeof evento.summary === 'string' ? evento.summary.trim().toLowerCase() : '';
  const p = String(prefixo || '').trim().toLowerCase();
  return p !== '' && titulo.startsWith(p);
}

function linhaConsulta(c) {
  return [c.id_evento, c.data, c.hora, c.tipo, c.codigo_paciente, c.status, c.atualizado_em];
}

// eventos: itens do Google Agenda (v3), inclusive os cancelados.
// existentes: linhas atuais de Consultas como objetos, cada uma com `linha` (número na planilha).
// pacientes: { codigo, email, telefone, ativo }.
// origemAtual: marca da agenda lida agora. Linha com `origem` diferente é de OUTRA agenda: não é cancelada, atualizada
// nem conferida (mesmo id em agenda diferente não prova nada). Linha sem `origem` conta como desta agenda.
// Devolve { inserir, atualizar, canceladas, aIdentificar, ignorados, avisos, ausentes }; não muda nada por conta própria.
// `ausentes` são consultas marcadas que não vieram na leitura: ausência NÃO cancela (pode ser remarcação para
// depois da janela). Quem chama confere cada uma na agenda e repete o plano com o evento devolvido.
function planejarSincronizacaoAgenda({ eventos, existentes, pacientes, prefixo, janela, agoraTexto, origemAtual }) {
  const f = formatosAgenda_();
  const daAgenda = (c) => !c.origem || !origemAtual || c.origem === origemAtual;
  const minhas = existentes.filter(daAgenda);
  const deOutraAgenda = existentes.length - minhas.length;
  const porId = new Map();
  for (const c of minhas) if (c.id_evento) porId.set(String(c.id_evento), c);
  const vistos = new Set();
  const atualizacoes = new Map(); // id_evento -> linha final
  const avisos = [];
  let ignorados = 0;
  let canceladas = 0;
  let canceladasComEventoNaAgenda = 0;
  const recemIdentificados = new Set(); // linhas sem paciente que a agenda acabou de identificar (A1)

  const cancelar = (c) => {
    if (c.status !== 'marcada') return; // realizada e faltou nunca são desfeitas pela agenda
    atualizacoes.set(String(c.id_evento), { ...c, status: 'cancelada', atualizado_em: agoraTexto });
    canceladas++;
  };

  // 1) Estado final dos eventos que já têm linha: cancelamento, remarcação, reativação, código do paciente.
  const validos = [];
  for (const ev of eventos) {
    if (!ev || !ev.id) { ignorados++; continue; }
    const id = String(ev.id);
    vistos.add(id);
    if (ev.status === 'cancelled') {
      if (porId.has(id)) cancelar(porId.get(id));
      continue; // evento cancelado não traz título nem horário: só serve para achar a linha
    }
    const local = ev.start ? f.dataHoraLocal(ev.start.dateTime) : null;
    if (!ehEventoDeConsulta(ev, prefixo) || !local) { ignorados++; continue; }
    validos.push({ ev, id, local });
  }
  validos.sort((a, b) => (a.local.data + a.local.hora).localeCompare(b.local.data + b.local.hora));

  const novosEventos = [];
  for (const { ev, id, local } of validos) {
    const atual = porId.get(id);
    if (!atual) { novosEventos.push({ ev, id, local }); continue; }
    const codigoAgenda = identificarPacienteAgenda(ev, pacientes);
    const base = atualizacoes.get(id) || atual;
    const novo = { ...base, data: local.data, hora: local.hora };
    if (!novo.codigo_paciente && codigoAgenda) { novo.codigo_paciente = codigoAgenda; recemIdentificados.add(id); }
    // Consulta cancelada por ela (lista suspensa) com o evento ainda na agenda continua cancelada (D19): só avisa.
    if (novo.status === 'cancelada') canceladasComEventoNaAgenda++;
    if (novo.data !== atual.data || novo.hora !== atual.hora
      || novo.codigo_paciente !== atual.codigo_paciente || novo.status !== atual.status) {
      novo.atualizado_em = agoraTexto;
      atualizacoes.set(id, novo);
    }
  }

  // 2) Marcada, dentro do período e ausente da leitura: não cancela. Só devolve a lista para conferência.
  // Agenda que voltou vazia ou trocada não é conferida: é mais provável erro de configuração.
  const emJanela = minhas.filter((c) => c.status === 'marcada' && c.id_evento && !vistos.has(String(c.id_evento))
    && String(c.data) >= janela.verificarDe && String(c.data) <= janela.verificarAte);
  let ausentes = [];
  if (emJanela.length > 0 && eventos.length === 0) {
    avisos.push(`A agenda voltou sem nenhum evento. Por segurança, nenhuma das ${emJanela.length} consultas marcadas foi cancelada. Confira o "calendario_id" na aba Configurações.`);
  } else {
    ausentes = emJanela.map((c) => String(c.id_evento));
  }
  if (deOutraAgenda > 0) {
    avisos.push(`${deOutraAgenda} consulta(s) vieram de outra agenda (o "calendario_id" mudou) e foram deixadas como estão: o kit não as cancela nem atualiza pela agenda nova.`);
  }

  // 3) Só agora as consultas novas: a cronologia usa o estado final (sem canceladas, com as datas remarcadas).
  const finais = existentes.map((c) => atualizacoes.get(String(c.id_evento)) || c);
  const historico = new Map(); // codigo -> [data+hora] de consultas não canceladas
  const registrarHistorico = (codigo, data, hora) => {
    if (!codigo) return;
    if (!historico.has(codigo)) historico.set(codigo, []);
    historico.get(codigo).push(data + hora);
  };
  for (const c of finais) if (c.status !== 'cancelada') registrarHistorico(c.codigo_paciente, String(c.data), String(c.hora));

  // A1: paciente identificado só agora. O tipo nasceu 'primeira' por falta de histórico; recalcula pela mesma regra da inserção.
  for (const id of recemIdentificados) {
    const c = atualizacoes.get(id);
    if (!c || c.tipo !== 'primeira') continue;
    const anteriores = (historico.get(c.codigo_paciente) || []).filter((x) => x < String(c.data) + String(c.hora));
    if (anteriores.length > 0) c.tipo = 'retorno';
  }
  if (canceladasComEventoNaAgenda > 0) {
    avisos.push(`${canceladasComEventoNaAgenda} consulta(s) marcada(s) como cancelada(s) na planilha ainda têm o evento na agenda e ficaram canceladas. `
      + 'Para cancelar de vez, apague o evento na agenda; para voltar a cobrar, mude o status para marcada.');
  }

  // Mesmo id em outra agenda: cobrança e recibo ligam pela única chave `id_evento`, então duas linhas com o mesmo id
  // se confundiriam. Não importa o evento e não mexe na linha antiga (R04d).
  const idsDeOutraAgenda = new Set(existentes.filter((c) => !daAgenda(c)).map((c) => String(c.id_evento)));
  const barrados = novosEventos.filter((n) => idsDeOutraAgenda.has(n.id));
  if (barrados.length > 0) {
    avisos.push(`${barrados.length} evento(s) da agenda atual têm o mesmo id de uma consulta de outra agenda e não foram importados, `
      + 'para não misturar cobrança e recibo. Não apague a consulta antiga; peça ajuda ao suporte.');
  }
  const novos = [];
  for (const { ev, id, local } of novosEventos.filter((n) => !idsDeOutraAgenda.has(n.id))) {
    const codigoAgenda = identificarPacienteAgenda(ev, pacientes);
    const anteriores = (historico.get(codigoAgenda) || []).filter((x) => x < local.data + local.hora);
    novos.push({
      id_evento: id, data: local.data, hora: local.hora,
      tipo: codigoAgenda && anteriores.length > 0 ? 'retorno' : 'primeira',
      codigo_paciente: codigoAgenda || '', status: 'marcada', atualizado_em: agoraTexto,
    });
    registrarHistorico(codigoAgenda, local.data, local.hora);
  }

  const atualizar = [...atualizacoes.values()].map((c) => ({ linha: c.linha, valores: linhaConsulta(c) }));
  const aIdentificar = finais.filter(daAgenda).concat(novos)
    .filter((c) => !c.codigo_paciente && c.status !== 'cancelada')
    .map((c) => ({ id_evento: c.id_evento, data: c.data, hora: c.hora }));
  return { inserir: novos.map(linhaConsulta), atualizar, canceladas, aIdentificar, ignorados, avisos, ausentes };
}

// Texto para a nutricionista, sem nome nem dado de saúde.
function resumirSincronizacao(plano) {
  const linhas = [
    `Consultas novas: ${plano.inserir.length}. Atualizadas ou canceladas: ${plano.atualizar.length} (canceladas: ${plano.canceladas}).`,
    `Eventos que não são consultas (ignorados): ${plano.ignorados}.`,
  ];
  if (plano.aIdentificar.length > 0) {
    linhas.push(`A identificar: ${plano.aIdentificar.length} consulta(s) sem paciente conhecido. `
      + 'Na aba Consultas, preencha "codigo_paciente" nas linhas em branco (confira o e-mail ou telefone do paciente na aba Pacientes).');
  }
  return linhas.concat(plano.avisos).join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = {
    calcularJanelaAgenda, marcaDaAgenda, normalizarTelefoneAgenda, contatosDoEvento, identificarPacienteAgenda,
    ehEventoDeConsulta, linhaConsulta, planejarSincronizacaoAgenda, resumirSincronizacao,
  };
}
