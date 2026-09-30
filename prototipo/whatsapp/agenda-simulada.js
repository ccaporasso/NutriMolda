'use strict';
// B1.2: agenda SIMULADA por consultório. A reserva é atômica (verificar + gravar sem pausa no meio),
// idempotente pela chave da operação e recusa dados inválidos mesmo que o núcleo já os tenha filtrado.
// Não prova concorrência no Google Agenda: alterações feitas direto na agenda real (WA03) precisam ser
// reconciliadas por outro mecanismo; aqui `bloquear` só imita um horário ocupado por fora.
const { ErroNucleo, gerarHorarios } = require('./contrato.js');
const { cederVez } = require('./adaptadores.js');

function criarAgendaSimulada({ falhas, latencia, relogio, config }) {
  const porCons = new Map();
  const dados = (cons) => { if (!porCons.has(cons)) porCons.set(cons, { consultas: [], bloqueios: [], porChave: new Map() }); return porCons.get(cons); };
  const copia = (c) => (c ? { ...c } : null);
  const sobrepoe = (a, b) => a.inicio < b.fim && b.inicio < a.fim;
  const ocupados = (d) => [...d.consultas.filter((c) => c.status === 'confirmada'), ...d.bloqueios];
  const validos = (inicio, fim) => gerarHorarios(relogio.agora(), { ...config, antecedenciaMin: 0 }).some((h) => h.inicio === inicio && h.fim === fim);

  return {
    async listarDisponiveis(cons, quantidade, excluirIds = []) {
      await cederVez(latencia);
      const d = dados(cons); const ocup = ocupados(d);
      return gerarHorarios(relogio.agora(), config).filter((h) => !ocup.some((o) => sobrepoe(h, o))).filter((h) => !excluirIds.includes(`h${Math.floor(h.inicio / 60000)}`)).slice(0, quantidade);
    },
    async estaDisponivel(cons, inicio, fim) {
      await cederVez(latencia);
      return !ocupados(dados(cons)).some((o) => sobrepoe({ inicio, fim }, o));
    },
    // Reserva atômica. Retorna { estado: 'reservada' | 'existente' | 'paciente_ja_tem' | 'conflito', consulta? }.
    async reservar(cons, { chave, pacienteCodigo, inicio, fim }) {
      await cederVez(latencia);
      await falhas.ponto('agenda.reservar.antes');
      if (!Number.isInteger(inicio) || !Number.isInteger(fim) || fim <= inicio || inicio <= relogio.agora() || !validos(inicio, fim)) throw new ErroNucleo('PEDIDO_INVALIDO');
      const d = dados(cons);
      let resultado;
      const igual = d.porChave.get(chave);
      if (igual) resultado = { estado: 'existente', consulta: copia(igual) };
      else {
        const dele = d.consultas.find((c) => c.pacienteCodigo === pacienteCodigo && c.status === 'confirmada' && c.fim > relogio.agora());
        if (dele) resultado = { estado: 'paciente_ja_tem', consulta: copia(dele) };
        else if (ocupados(d).some((o) => sobrepoe({ inicio, fim }, o))) resultado = { estado: 'conflito' };
        else {
          const consulta = { id: `C${String(d.consultas.length + 1).padStart(4, '0')}`, consultorioId: cons, pacienteCodigo, origemAgenda: 'agenda_simulada', inicio, fim, status: 'confirmada', chave, criadaEm: relogio.agora() };
          d.consultas.push(consulta); d.porChave.set(chave, consulta);
          resultado = { estado: 'reservada', consulta: copia(consulta) };
        }
      }
      // A reserva já valeu; uma falha aqui deixa o resultado INCERTO para quem chamou.
      await falhas.ponto('agenda.reservar.depois');
      return resultado;
    },
    // Cancelamento atômico e idempotente pela chave. Nunca mexe em cobrança (fora deste repositório).
    async cancelar(cons, { chave, consultaId, pacienteCodigo = null, motivo = 'cancelada' }) {
      await cederVez(latencia);
      await falhas.ponto('agenda.cancelar.antes');
      const d = dados(cons);
      const c = d.consultas.find((x) => x.id === consultaId);
      let resultado;
      if (!c || (pacienteCodigo && c.pacienteCodigo !== pacienteCodigo)) resultado = { estado: 'nao_encontrada' };
      else if (c.status === 'cancelada') resultado = { estado: c.chaveCancelamento === chave ? 'existente' : 'ja_cancelada', consulta: copia(c) };
      else if (c.fim <= relogio.agora()) resultado = { estado: 'passada', consulta: copia(c) };
      else { c.status = 'cancelada'; c.canceladaEm = relogio.agora(); c.motivo = motivo; c.chaveCancelamento = chave; resultado = { estado: 'cancelada', consulta: copia(c) }; }
      await falhas.ponto('agenda.cancelar.depois');
      return resultado;
    },
    async buscarCancelamentoPorChave(cons, chave) { await cederVez(latencia); return copia(dados(cons).consultas.find((c) => c.chaveCancelamento === chave)); },
    // Remarcação atômica: reserva o novo horário e cancela o antigo no MESMO passo; se o novo não servir, nada muda.
    async remarcar(cons, { chave, consultaId, pacienteCodigo, inicio, fim }) {
      await cederVez(latencia);
      await falhas.ponto('agenda.reservar.antes');
      if (!Number.isInteger(inicio) || !Number.isInteger(fim) || fim <= inicio || inicio <= relogio.agora() || !validos(inicio, fim)) throw new ErroNucleo('PEDIDO_INVALIDO');
      const d = dados(cons);
      let resultado;
      const igual = d.porChave.get(chave);
      const antiga = d.consultas.find((x) => x.id === consultaId);
      if (igual) resultado = { estado: 'existente', consulta: copia(igual) };
      else if (!antiga || antiga.pacienteCodigo !== pacienteCodigo || antiga.status !== 'confirmada') resultado = { estado: 'nao_encontrada' };
      else if (antiga.fim <= relogio.agora()) resultado = { estado: 'passada' };
      else if (antiga.inicio === inicio) resultado = { estado: 'mesmo_horario', consulta: copia(antiga) };
      else if (ocupados(d).filter((o) => o !== antiga).some((o) => sobrepoe({ inicio, fim }, o))) resultado = { estado: 'conflito' };
      else {
        const nova = { id: `C${String(d.consultas.length + 1).padStart(4, '0')}`, consultorioId: cons, pacienteCodigo, origemAgenda: 'agenda_simulada', inicio, fim, status: 'confirmada', chave, criadaEm: relogio.agora() };
        antiga.status = 'cancelada'; antiga.canceladaEm = relogio.agora(); antiga.motivo = 'remarcada'; antiga.substituidaPor = nova.id; antiga.chaveCancelamento = chave;
        d.consultas.push(nova); d.porChave.set(chave, nova);
        resultado = { estado: 'remarcada', consulta: copia(nova), anterior: copia(antiga) };
      }
      await falhas.ponto('agenda.reservar.depois');
      return resultado;
    },
    async buscarPorChave(cons, chave) { await cederVez(latencia); return copia(dados(cons).porChave.get(chave)); },
    async obterConsulta(cons, id) { await cederVez(latencia); return copia(dados(cons).consultas.find((c) => c.id === id)); },
    async listarConsultas(cons) { await cederVez(latencia); return dados(cons).consultas.map(copia).sort((a, b) => a.inicio - b.inicio); },
    async consultaAtiva(cons, pacienteCodigo) {
      await cederVez(latencia);
      return copia(dados(cons).consultas.find((c) => c.pacienteCodigo === pacienteCodigo && c.status === 'confirmada' && c.fim > relogio.agora()));
    },
    // Imita um horário ocupado por fora (alteração direta na agenda).
    bloquear(cons, inicio, fim) { dados(cons).bloqueios.push({ inicio, fim }); },
  };
}

module.exports = { criarAgendaSimulada };
