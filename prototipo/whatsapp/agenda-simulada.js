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
