'use strict';
// B1.2 + item 2: manipuladores de agendamento (ver horários -> escolher -> confirmar), remarcar e cancelar, e reconciliação.
// Escolher NÃO reserva; só confirmar reserva. A confirmação exige opção atual, versão válida e autorização ativa.
// Remarcar troca de horário de forma atômica (o novo entra e o antigo sai no mesmo passo); cancelar pede confirmação.
// Nada aqui mexe em cobrança: o financeiro é outro módulo e os resultados dizem `cobranca: 'inalterada'`.
const { formatarInstante, ErroNucleo } = require('./contrato.js');
const { criarAgendaSimulada } = require('./agenda-simulada.js');

const idOpcao = (h) => `h${Math.floor(h.inicio / 60000)}`;
const semEfeito = (motivo) => ({ resultado: { tipo: 'sem_efeito', motivo } });
const acoesMenu = () => [
  { rotulo: 'Ver horários', comando: 'ver_horarios' },
  { rotulo: 'Falar com a nutricionista', comando: 'falar_com_nutricionista' },
  { rotulo: 'Parar mensagens', comando: 'parar' },
];
const acoesConsulta = () => [
  { rotulo: 'Remarcar', comando: 'remarcar_consulta' },
  { rotulo: 'Cancelar consulta', comando: 'cancelar_consulta' },
  { rotulo: 'Menu', comando: 'menu' },
];
const textoConfirmacao = (c, remarcada) => `Consulta ${remarcada ? 'remarcada' : 'confirmada'} para ${formatarInstante(c.inicio)}. Até lá!`;
const textoCancelada = 'Consulta cancelada. Se precisar, você pode escolher outro horário.';

function montarAgendamento({ repos, relogio, config }) {
  const agenda = repos.agenda || criarAgendaSimulada({ falhas: repos.falhas, latencia: repos.latencia, relogio, config });

  // Mostra opções atuais (várias, cada uma com ID estável). Não reserva nada. `remarcando` = id da consulta a trocar.
  async function ofertar(d, { aviso, remarcando = null } = {}) {
    const horarios = await agenda.listarDisponiveis(d.cons, config.opcoesPorVez);
    if (!horarios.length) {
      return { conversa: { estado: 'menu', opcoes: [], opcaoEscolhida: null }, saidas: [{ tipo: 'sem_horarios', texto: 'No momento não há horários livres. Você pode falar com a nutricionista.', acoes: acoesMenu() }], resultado: { tipo: 'resposta', acao: 'sem_horarios' } };
    }
    const opcoes = horarios.map((h) => ({ id: idOpcao(h), inicio: h.inicio, fim: h.fim }));
    const acoes = opcoes.map((o) => ({ rotulo: formatarInstante(o.inicio), comando: 'escolher_horario', opcaoId: o.id }));
    const padrao = remarcando ? 'Estes horários estão livres para remarcar. Escolha um (a escolha ainda não troca a consulta):' : 'Estes horários estão livres. Escolha um (a escolha ainda não reserva):';
    return {
      conversa: { estado: 'escolhendo_horario', opcoes, opcaoEscolhida: null, remarcando },
      saidas: [{ tipo: 'opcoes_horario', texto: aviso || padrao, acoes }],
      resultado: { tipo: 'resposta', acao: aviso ? 'conflito' : 'opcoes' },
    };
  }
  const voltarAoMenu = (texto, acao) => ({ conversa: { estado: 'menu', opcoes: [], opcaoEscolhida: null, consultaId: null }, saidas: [{ tipo: 'aviso', texto, acoes: acoesMenu() }], resultado: { tipo: 'resposta', acao } });

  const manipuladores = {
    async ver_horarios(d) {
      const ativa = await agenda.consultaAtiva(d.cons, d.paciente.codigo);
      if (d.conversa.remarcando) { // "Escolher outro" durante uma remarcação
        if (!ativa || ativa.id !== d.conversa.remarcando) return voltarAoMenu('Não encontrei sua consulta atual para remarcar.', 'sem_consulta');
        return ofertar(d, { remarcando: ativa.id });
      }
      if (ativa) return { saidas: [{ tipo: 'consulta_existente', texto: `Você já tem consulta em ${formatarInstante(ativa.inicio)}.`, acoes: acoesConsulta() }], resultado: { tipo: 'resposta', acao: 'ja_tem_consulta', consultaId: ativa.id } };
      return ofertar(d);
    },

    async remarcar_consulta(d) {
      const ativa = await agenda.consultaAtiva(d.cons, d.paciente.codigo);
      if (!ativa) return semEfeito('sem_consulta');
      return ofertar(d, { remarcando: ativa.id });
    },

    async cancelar_consulta(d) {
      const ativa = await agenda.consultaAtiva(d.cons, d.paciente.codigo);
      if (!ativa) return semEfeito('sem_consulta');
      return {
        conversa: { estado: 'aguardando_cancelamento', cancelando: ativa.id, opcoes: [], opcaoEscolhida: null },
        saidas: [{ tipo: 'pedir_cancelamento', texto: `Cancelar a consulta de ${formatarInstante(ativa.inicio)}?`, acoes: [{ rotulo: 'Sim, cancelar', comando: 'confirmar_cancelamento', opcaoId: ativa.id }, { rotulo: 'Manter consulta', comando: 'menu' }] }],
        resultado: { tipo: 'resposta', acao: 'aguardando_cancelamento' },
      };
    },

    async confirmar_cancelamento(d) {
      const { opcaoId, versao } = d.parametros; const conv = d.conversa;
      if (opcaoId === undefined || versao === undefined || conv.cancelando !== opcaoId) return semEfeito('opcao_invalida'); // nunca uma consulta que não seja a dela
      if (versao !== conv.versao) return semEfeito('versao_antiga');
      if (!(await d.autorizado())) return semEfeito('sem_liberacao');
      const r = await agenda.cancelar(d.cons, { chave: d.chave, consultaId: conv.cancelando, pacienteCodigo: d.paciente.codigo, motivo: 'cancelada_pelo_paciente' });
      if (r.estado === 'nao_encontrada' || r.estado === 'passada') return voltarAoMenu('Não encontrei uma consulta futura para cancelar.', 'sem_consulta');
      const base = voltarAoMenu(textoCancelada, 'consulta_cancelada');
      return { ...base, resultado: { ...base.resultado, consultaId: conv.cancelando, cobranca: 'inalterada' } };
    },

    async escolher_horario(d) {
      const { opcaoId, versao } = d.parametros;
      if (opcaoId === undefined || versao === undefined) return semEfeito('pedido_incompleto');
      if (versao !== d.conversa.versao) return semEfeito('versao_antiga');
      const op = (d.conversa.opcoes || []).find((o) => o.id === opcaoId); // nunca por posição
      if (!op) return semEfeito('opcao_invalida');
      if (op.inicio <= d.agora) return semEfeito('horario_passado');
      const remarcando = d.conversa.remarcando || null;
      if (!(await agenda.estaDisponivel(d.cons, op.inicio, op.fim))) return ofertar(d, { aviso: 'Esse horário não está mais disponível. Escolha outro:', remarcando });
      return {
        conversa: { estado: 'aguardando_confirmacao', opcoes: d.conversa.opcoes, opcaoEscolhida: op, remarcando },
        saidas: [{ tipo: 'pedir_confirmacao', texto: `${remarcando ? 'Remarcar para' : 'Confirmar consulta em'} ${formatarInstante(op.inicio)}?`, acoes: [{ rotulo: 'Confirmar', comando: 'confirmar', opcaoId: op.id }, { rotulo: 'Escolher outro', comando: 'ver_horarios' }] }],
        resultado: { tipo: 'resposta', acao: 'aguardando_confirmacao' },
      };
    },

    async confirmar(d) {
      const { opcaoId, versao } = d.parametros;
      const conv = d.conversa;
      if (opcaoId === undefined || versao === undefined || !conv.opcaoEscolhida || conv.opcaoEscolhida.id !== opcaoId) return semEfeito('opcao_invalida');
      if (conv.estado === 'consulta_confirmada') { // repetição: devolve a reserva existente, sem criar outra
        const c = await agenda.obterConsulta(d.cons, conv.consultaId);
        if (!c) return semEfeito('consulta_nao_encontrada');
        if (c.status !== 'confirmada') return semEfeito('consulta_cancelada');
        return { saidas: [{ tipo: 'confirmacao_consulta', texto: textoConfirmacao(c), acoes: acoesConsulta() }], resultado: { tipo: 'resposta', acao: 'consulta_ja_confirmada', consultaId: c.id } };
      }
      if (versao !== conv.versao) return semEfeito('versao_antiga');
      const op = conv.opcaoEscolhida;
      if (op.inicio <= d.agora) return semEfeito('horario_passado');
      if (!(await d.autorizado())) return semEfeito('sem_liberacao'); // revalida logo antes do efeito
      if (conv.remarcando) {
        const r = await agenda.remarcar(d.cons, { chave: d.chave, consultaId: conv.remarcando, pacienteCodigo: d.paciente.codigo, inicio: op.inicio, fim: op.fim });
        if (r.estado === 'conflito') return ofertar(d, { aviso: 'Esse horário acabou de ser ocupado. Escolha outro:', remarcando: conv.remarcando });
        if (r.estado === 'mesmo_horario') return semEfeito('mesmo_horario');
        if (r.estado === 'nao_encontrada' || r.estado === 'passada') return voltarAoMenu('Não encontrei sua consulta atual para remarcar.', 'sem_consulta');
        return {
          conversa: { estado: 'consulta_confirmada', consultaId: r.consulta.id, opcaoEscolhida: op, opcoes: [], remarcando: null },
          saidas: [{ tipo: 'confirmacao_consulta', texto: textoConfirmacao(r.consulta, true), acoes: acoesConsulta() }],
          resultado: { tipo: 'resposta', acao: 'consulta_remarcada', consultaId: r.consulta.id, cobranca: 'inalterada' },
        };
      }
      const r = await agenda.reservar(d.cons, { chave: d.chave, pacienteCodigo: d.paciente.codigo, inicio: op.inicio, fim: op.fim });
      if (r.estado === 'conflito') return ofertar(d, { aviso: 'Esse horário acabou de ser ocupado. Escolha outro:' });
      return {
        conversa: { estado: 'consulta_confirmada', consultaId: r.consulta.id, opcaoEscolhida: op, opcoes: [] },
        saidas: [{ tipo: 'confirmacao_consulta', texto: textoConfirmacao(r.consulta), acoes: acoesConsulta() }],
        resultado: { tipo: 'resposta', acao: 'consulta_confirmada', consultaId: r.consulta.id },
      };
    },

    // Recuperação de uma operação que ficou pendente (resultado externo incerto).
    reconciliar: {
      async confirmar({ cons, op, repos: rp, agora, autorizacao }) {
        const consulta = await agenda.buscarPorChave(cons, op.chave);
        const ativa = (await autorizacao()) === 'ativa';
        if (!consulta) {
          if (ativa) return { resultado: 'pendentes' }; // nada foi reservado: o paciente pode repetir
          await rp.operacoes.concluir(cons, op.chave, { ok: true, tipo: 'sem_efeito', motivo: 'sem_liberacao', saidas: [] }, 'descartada');
          return { resultado: 'descartadas' };
        }
        if (!ativa) { // a consulta gravada é mantida; só nenhum novo efeito automático
          await rp.operacoes.concluir(cons, op.chave, { ok: true, tipo: 'sem_efeito', motivo: 'consulta_mantida_sem_liberacao', consultaId: consulta.id, saidas: [] });
          return { resultado: 'mantidas' };
        }
        const conv = await rp.conversas.obter(cons, op.paciente);
        const remarcada = Boolean(conv && conv.remarcando);
        if (conv && conv.estado === 'aguardando_confirmacao') {
          if (!(await rp.conversas.gravar(cons, op.paciente, { ...conv, estado: 'consulta_confirmada', consultaId: consulta.id, opcoes: [], remarcando: null, atualizadoEm: agora }, conv.versao))) return { resultado: 'pendentes' };
        }
        const pac = await rp.cadastro.obterPaciente(cons, op.paciente);
        const id = await rp.saida.enfileirar(cons, { chave: `${op.chave}#1`, pacienteCodigo: op.paciente, canalId: pac.canalId, tipo: 'confirmacao_consulta', texto: textoConfirmacao(consulta, remarcada), acoes: acoesConsulta(), sempre: false });
        await rp.operacoes.concluir(cons, op.chave, { ok: true, tipo: 'resposta', acao: remarcada ? 'consulta_remarcada' : 'consulta_confirmada', estado: 'consulta_confirmada', consultaId: consulta.id, saidas: [id] });
        return { resultado: 'concluidas' };
      },

      async confirmar_cancelamento({ cons, op, repos: rp, agora, autorizacao }) {
        const cancelada = await agenda.buscarCancelamentoPorChave(cons, op.chave);
        const ativa = (await autorizacao()) === 'ativa';
        if (!cancelada) {
          if (ativa) return { resultado: 'pendentes' };
          await rp.operacoes.concluir(cons, op.chave, { ok: true, tipo: 'sem_efeito', motivo: 'sem_liberacao', saidas: [] }, 'descartada');
          return { resultado: 'descartadas' };
        }
        if (!ativa) { // o cancelamento já valeu; só não há mensagem automática
          await rp.operacoes.concluir(cons, op.chave, { ok: true, tipo: 'sem_efeito', motivo: 'cancelamento_feito_sem_liberacao', consultaId: cancelada.id, saidas: [] });
          return { resultado: 'concluidas' };
        }
        const conv = await rp.conversas.obter(cons, op.paciente);
        if (conv && conv.estado === 'aguardando_cancelamento') {
          if (!(await rp.conversas.gravar(cons, op.paciente, { estado: 'menu', consultaId: null, atualizadoEm: agora }, conv.versao))) return { resultado: 'pendentes' };
        }
        const pac = await rp.cadastro.obterPaciente(cons, op.paciente);
        const id = await rp.saida.enfileirar(cons, { chave: `${op.chave}#1`, pacienteCodigo: op.paciente, canalId: pac.canalId, tipo: 'aviso', texto: textoCancelada, acoes: acoesMenu(), sempre: false });
        await rp.operacoes.concluir(cons, op.chave, { ok: true, tipo: 'resposta', acao: 'consulta_cancelada', estado: 'menu', consultaId: cancelada.id, cobranca: 'inalterada', saidas: [id] });
        return { resultado: 'concluidas' };
      },
    },
  };

  return { repos: { agenda }, manipuladores };
}

module.exports = { montarAgendamento, idOpcao, ErroNucleo };
