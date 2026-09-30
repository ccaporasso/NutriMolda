'use strict';
// B1.3: camada de API da demonstração local. Só traduz pedidos HTTP em chamadas ao MESMO núcleo usado
// pelos testes; não tem regra de negócio própria. Dados fictícios; nada sai desta máquina.
const { criarCenario, CONS, CANAIS } = require('../whatsapp/cenario.js');
const C = require('../whatsapp/contrato.js');

const DIA = 86400000;
const ROTULOS_ESTADO = {
  sem_liberacao: 'Sem liberação', menu: 'No menu', escolhendo_horario: 'Escolhendo horário', aguardando_confirmacao: 'Aguardando confirmação',
  consulta_confirmada: 'Consulta confirmada', atendimento_humano: 'Atendimento humano (automação pausada)', revogado: 'Revogado',
};

async function criarDemo(opcoes = {}) {
  let cen = await criarCenario({ inicio: opcoes.inicio || new Date().toISOString() });
  let seq = 0;
  const texto = (ms) => C.formatarInstante(ms);

  async function estado() {
    const pacs = await cen.nucleo.listarPacientes(cen.prof, { consultorioId: CONS });
    const cons = await cen.nucleo.listarConsultas(cen.prof, { consultorioId: CONS });
    const nomes = Object.fromEntries(pacs.pacientes.map((p) => [p.codigo, p.nome]));
    const mensagens = await cen.repos.saida.listar(CONS);
    const pendentes = await cen.repos.operacoes.listarPendentes(CONS);
    return {
      ficticio: true,
      agora: cen.relogio.agora(), agoraTexto: texto(cen.relogio.agora()),
      pacientes: pacs.pacientes.map((p) => ({ ...p, estadoTexto: ROTULOS_ESTADO[p.estado] || p.estado, validaAteTexto: p.validaAte ? texto(p.validaAte) : null, atencao: p.estado === 'atendimento_humano' })),
      consultas: cons.consultas.map((c) => ({ ...c, inicioTexto: texto(c.inicio), pacienteNome: nomes[c.pacienteCodigo] })),
      mensagens: mensagens.map((m) => ({ id: m.id, pacienteCodigo: m.pacienteCodigo, tipo: m.tipo, texto: m.texto, acoes: m.acoes, estado: m.estado })),
      pendencias: pendentes.length,
      falhasArmadas: cen.repos.falhas.pontos(),
    };
  }

  const codigoValido = (b) => b && C.ehCodigoPaciente(b.codigoPaciente) && CANAIS[b.codigoPaciente];

  async function tratar(metodo, caminho, corpo) {
    const b = corpo || {};
    if (metodo === 'GET' && caminho === '/api/estado') return { status: 200, json: await estado() };
    const det = /^\/api\/consultas\/([A-Za-z0-9_.:-]{1,64})$/.exec(caminho);
    if (metodo === 'GET' && det) {
      const r = await cen.nucleo.detalharConsulta(cen.prof, { consultorioId: CONS, consultaId: det[1] });
      if (r.ok) r.consulta.inicioTexto = texto(r.consulta.inicio);
      return { status: r.ok ? 200 : 404, json: r };
    }
    if (metodo !== 'POST') return { status: 404, json: { ok: false, codigo: 'NAO_ENCONTRADA', mensagem: 'Não encontrado.' } };

    if (caminho === '/api/profissional/liberar') {
      if (!codigoValido(b)) return { status: 400, json: { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'O pedido está incompleto ou fora do formato esperado.' } };
      const dias = Number.isInteger(b.dias) && b.dias > 0 ? b.dias : 30;
      const r = await cen.nucleo.liberarPaciente(cen.prof, { consultorioId: CONS, codigoPaciente: b.codigoPaciente, canalId: CANAIS[b.codigoPaciente], validaAte: new Date(cen.relogio.agora() + dias * DIA).toISOString() });
      return { status: r.ok ? 200 : 422, json: r };
    }
    const acaoProf = { '/api/profissional/revogar': 'revogarLiberacao', '/api/profissional/pausar': 'pausarAutomacao', '/api/profissional/retomar': 'retomarAtendimento' }[caminho];
    if (acaoProf) {
      if (!codigoValido(b)) return { status: 400, json: { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'O pedido está incompleto ou fora do formato esperado.' } };
      const r = await cen.nucleo[acaoProf](cen.prof, { consultorioId: CONS, codigoPaciente: b.codigoPaciente });
      return { status: r.ok ? 200 : 422, json: r };
    }
    if (caminho === '/api/paciente/evento') {
      if (!codigoValido(b)) return { status: 400, json: { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'O pedido está incompleto ou fora do formato esperado.' } };
      const comando = typeof b.texto === 'string' ? C.comandoDeTexto(b.texto) : b.comando;
      seq += 1;
      const r = await cen.nucleo.processarEventoPaciente(cen.ctxPac(b.codigoPaciente), { consultorioId: CONS, eventoId: b.eventoId || `DEMO-${seq}`, comando, parametros: b.parametros });
      return { status: 200, json: r };
    }
    if (caminho === '/api/demo/reiniciar') { cen = await criarCenario({ inicio: opcoes.inicio || new Date().toISOString() }); seq = 0; return { status: 200, json: { ok: true } }; }
    if (caminho === '/api/demo/avancar') {
      const h = Number(b.horas);
      if (!Number.isFinite(h) || h <= 0 || h > 24 * 60) return { status: 400, json: { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'Informe entre 1 e 1440 horas.' } };
      cen.relogio.avancar(h * 3600000);
      await cen.nucleo.despachar(cen.sistema, { consultorioId: CONS });
      return { status: 200, json: { ok: true } };
    }
    if (caminho === '/api/demo/falha') {
      const ponto = ['agenda.reservar.antes', 'agenda.reservar.depois', 'conversas.gravar', 'saida.entregar.antes'].includes(b.ponto) ? b.ponto : null;
      if (!ponto) return { status: 400, json: { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'Ponto de falha desconhecido.' } };
      cen.repos.falhas.armar(ponto, 1);
      return { status: 200, json: { ok: true } };
    }
    if (caminho === '/api/demo/ocupar') { // imita um horário ocupado por fora (alteração direta na agenda)
      if (!codigoValido(b)) return { status: 400, json: { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'O pedido está incompleto ou fora do formato esperado.' } };
      const conv = await cen.repos.conversas.obter(CONS, b.codigoPaciente);
      const alvo = conv && (conv.opcaoEscolhida || (conv.opcoes || [])[0]);
      if (!alvo) return { status: 422, json: { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'Esta paciente ainda não recebeu horários.' } };
      cen.repos.agenda.bloquear(CONS, alvo.inicio, alvo.fim);
      return { status: 200, json: { ok: true } };
    }
    if (caminho === '/api/demo/reconciliar') {
      const r = await cen.nucleo.reconciliarPendentes(cen.sistema, { consultorioId: CONS });
      return { status: 200, json: r };
    }
    return { status: 404, json: { ok: false, codigo: 'NAO_ENCONTRADA', mensagem: 'Não encontrado.' } };
  }

  return { tratar, cenario: () => cen };
}

module.exports = { criarDemo };
