'use strict';
// B1.2: manipuladores de agendamento (ver horários -> escolher -> confirmar) e reconciliação.
// Escolher NÃO reserva; só confirmar reserva. A confirmação exige opção atual, versão válida e autorização ativa.
const { formatarInstante, ErroNucleo } = require('./contrato.js');
const { criarAgendaSimulada } = require('./agenda-simulada.js');

const idOpcao = (h) => `h${Math.floor(h.inicio / 60000)}`;
const semEfeito = (motivo) => ({ resultado: { tipo: 'sem_efeito', motivo } });
const acoesMenu = () => [
  { rotulo: 'Ver horários', comando: 'ver_horarios' },
  { rotulo: 'Falar com a nutricionista', comando: 'falar_com_nutricionista' },
  { rotulo: 'Parar mensagens', comando: 'parar' },
];
const textoConfirmacao = (c) => `Consulta confirmada para ${formatarInstante(c.inicio)}. Até lá!`;

function montarAgendamento({ repos, relogio, config }) {
  const agenda = criarAgendaSimulada({ falhas: repos.falhas, latencia: repos.latencia, relogio, config });

  // Mostra opções atuais (várias, cada uma com ID estável). Não reserva nada.
  async function ofertar(d, aviso) {
    const horarios = await agenda.listarDisponiveis(d.cons, config.opcoesPorVez);
    if (!horarios.length) {
      return { conversa: { estado: 'menu', opcoes: [], opcaoEscolhida: null }, saidas: [{ tipo: 'sem_horarios', texto: 'No momento não há horários livres. Você pode falar com a nutricionista.', acoes: acoesMenu() }], resultado: { tipo: 'resposta', acao: 'sem_horarios' } };
    }
    const opcoes = horarios.map((h) => ({ id: idOpcao(h), inicio: h.inicio, fim: h.fim }));
    const acoes = opcoes.map((o) => ({ rotulo: formatarInstante(o.inicio), comando: 'escolher_horario', opcaoId: o.id }));
    return {
      conversa: { estado: 'escolhendo_horario', opcoes, opcaoEscolhida: null },
      saidas: [{ tipo: 'opcoes_horario', texto: aviso || 'Estes horários estão livres. Escolha um (a escolha ainda não reserva):', acoes }],
      resultado: { tipo: 'resposta', acao: aviso ? 'conflito' : 'opcoes' },
    };
  }

  const manipuladores = {
    async ver_horarios(d) {
      const ativa = await agenda.consultaAtiva(d.cons, d.paciente.codigo);
      if (ativa) return { saidas: [{ tipo: 'consulta_existente', texto: `Você já tem consulta em ${formatarInstante(ativa.inicio)}.`, acoes: acoesMenu() }], resultado: { tipo: 'resposta', acao: 'ja_tem_consulta', consultaId: ativa.id } };
      return ofertar(d);
    },

    async escolher_horario(d) {
      const { opcaoId, versao } = d.parametros;
      if (opcaoId === undefined || versao === undefined) return semEfeito('pedido_incompleto');
      if (versao !== d.conversa.versao) return semEfeito('versao_antiga');
      const op = (d.conversa.opcoes || []).find((o) => o.id === opcaoId); // nunca por posição
      if (!op) return semEfeito('opcao_invalida');
      if (op.inicio <= d.agora) return semEfeito('horario_passado');
      if (!(await agenda.estaDisponivel(d.cons, op.inicio, op.fim))) return ofertar(d, 'Esse horário não está mais disponível. Escolha outro:');
      return {
        conversa: { estado: 'aguardando_confirmacao', opcoes: d.conversa.opcoes, opcaoEscolhida: op },
        saidas: [{ tipo: 'pedir_confirmacao', texto: `Confirmar consulta em ${formatarInstante(op.inicio)}?`, acoes: [{ rotulo: 'Confirmar', comando: 'confirmar', opcaoId: op.id }, { rotulo: 'Escolher outro', comando: 'ver_horarios' }] }],
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
        return { saidas: [{ tipo: 'confirmacao_consulta', texto: textoConfirmacao(c) }], resultado: { tipo: 'resposta', acao: 'consulta_ja_confirmada', consultaId: c.id } };
      }
      if (versao !== conv.versao) return semEfeito('versao_antiga');
      const op = conv.opcaoEscolhida;
      if (op.inicio <= d.agora) return semEfeito('horario_passado');
      if (!(await d.autorizado())) return semEfeito('sem_liberacao'); // revalida logo antes do efeito
      const r = await agenda.reservar(d.cons, { chave: d.chave, pacienteCodigo: d.paciente.codigo, inicio: op.inicio, fim: op.fim });
      if (r.estado === 'conflito') return ofertar(d, 'Esse horário acabou de ser ocupado. Escolha outro:');
      return {
        conversa: { estado: 'consulta_confirmada', consultaId: r.consulta.id, opcaoEscolhida: op, opcoes: [] },
        saidas: [{ tipo: 'confirmacao_consulta', texto: textoConfirmacao(r.consulta) }],
        resultado: { tipo: 'resposta', acao: 'consulta_confirmada', consultaId: r.consulta.id },
      };
    },

    // Recuperação de uma confirmação que ficou pendente (resultado externo incerto).
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
        if (conv && conv.estado === 'aguardando_confirmacao') {
          if (!(await rp.conversas.gravar(cons, op.paciente, { ...conv, estado: 'consulta_confirmada', consultaId: consulta.id, opcoes: [], atualizadoEm: agora }, conv.versao))) return { resultado: 'pendentes' };
        }
        const pac = await rp.cadastro.obterPaciente(cons, op.paciente);
        const id = await rp.saida.enfileirar(cons, { chave: `${op.chave}#1`, pacienteCodigo: op.paciente, canalId: pac.canalId, tipo: 'confirmacao_consulta', texto: textoConfirmacao(consulta), acoes: [], sempre: false });
        await rp.operacoes.concluir(cons, op.chave, { ok: true, tipo: 'resposta', acao: 'consulta_confirmada', estado: 'consulta_confirmada', consultaId: consulta.id, saidas: [id] });
        return { resultado: 'concluidas' };
      },
    },
  };

  return { repos: { agenda }, manipuladores };
}

module.exports = { montarAgendamento, idOpcao, ErroNucleo };
