'use strict';
// B1.1: núcleo de autorização, liberação e estados da conversa. Usado pelos testes, pelo simulador e pela
// interface local. Não chama rede: só os adaptadores recebidos (simulados). Não interpreta webhook bruto da Meta.
const C = require('./contrato.js');
const { ErroNucleo, FalhaExterna } = C;
const { calcularAtencao } = require('./atencao.js');

const COMANDOS_PACIENTE = ['menu', 'parar', 'ver_horarios', 'falar_com_nutricionista', 'escolher_horario', 'confirmar', 'remarcar_consulta', 'cancelar_consulta', 'confirmar_cancelamento', 'texto_livre'];
const PARAMETROS_PERMITIDOS = ['opcaoId', 'versao'];

// Quais comandos cada estado aceita. Fora disso: resultado neutro, sem gravação e sem saída.
const COMANDOS_POR_ESTADO = {
  menu: ['menu', 'ver_horarios', 'remarcar_consulta', 'cancelar_consulta', 'falar_com_nutricionista', 'parar'],
  escolhendo_horario: ['menu', 'ver_horarios', 'escolher_horario', 'cancelar_consulta', 'falar_com_nutricionista', 'parar'],
  aguardando_confirmacao: ['menu', 'ver_horarios', 'confirmar', 'cancelar_consulta', 'falar_com_nutricionista', 'parar'],
  consulta_confirmada: ['menu', 'confirmar', 'ver_horarios', 'remarcar_consulta', 'cancelar_consulta', 'falar_com_nutricionista', 'parar'],
  aguardando_cancelamento: ['menu', 'confirmar_cancelamento', 'falar_com_nutricionista', 'parar'],
  atendimento_humano: ['parar'],
  revogado: [],
};

// Textos de TESTE (fictícios, sem conteúdo clínico).
const TEXTOS = {
  menu: 'Olá! Como posso ajudar? Você pode ver horários ou falar com a nutricionista. Para parar de receber mensagens, envie PARAR.',
  parar: 'Pronto, você não receberá mais mensagens automáticas.',
  humano: 'Certo, avisei a nutricionista. As respostas automáticas ficam pausadas até ela retomar o contato.',
};

const acoesMenu = () => [
  { rotulo: 'Ver horários', comando: 'ver_horarios' },
  { rotulo: 'Falar com a nutricionista', comando: 'falar_com_nutricionista' },
  { rotulo: 'Parar mensagens', comando: 'parar' },
];

function situacaoLiberacao(lib, agora) {
  if (!lib) return 'nenhuma';
  if (lib.revogadaEm) return 'revogada';
  if (lib.validaAte <= agora) return 'expirada';
  return 'ativa';
}

function criarNucleo({ verificar, repos, relogio, config = C.CONFIG_TESTE, registrar = () => {}, manipuladores = {} }) {
  // Registro sem corpo de conversa, telefone, segredo ou dado clínico: só códigos e nomes de evento.
  const log = (evento, dados) => { try { registrar({ evento, ...dados }); } catch (e) { /* registro nunca derruba o núcleo */ } };

  function exigirContexto(ctx, papel, consultorioId) {
    if (!verificar(ctx)) throw new ErroNucleo('CONTEXTO_INVALIDO');
    if (ctx.papel !== papel) throw new ErroNucleo('CONTEXTO_INCOMPATIVEL');
    if (!C.ehId(consultorioId) || ctx.consultorioId !== consultorioId) throw new ErroNucleo('CONTEXTO_INCOMPATIVEL');
    return ctx.consultorioId;
  }

  // Converte qualquer exceção em resposta neutra; nunca devolve texto da exceção.
  async function executar(nome, fn) {
    try { return await fn(); } catch (e) {
      if (e instanceof ErroNucleo) { log(nome, { resultado: 'recusado', codigo: e.codigo }); return { ok: false, codigo: e.codigo, mensagem: e.message }; }
      const temporaria = e instanceof FalhaExterna;
      log(nome, { resultado: 'falha', codigo: temporaria ? 'FALHA_TEMPORARIA' : 'ERRO_INTERNO' });
      const codigo = temporaria ? 'FALHA_TEMPORARIA' : 'ERRO_INTERNO';
      return { ok: false, codigo, mensagem: new ErroNucleo(codigo).message, tentarDeNovo: temporaria };
    }
  }

  const conversaPadrao = () => ({ estado: 'menu', versao: 0 });

  async function autorizacao(cons, codigo) {
    return situacaoLiberacao(await repos.cadastro.obterLiberacao(cons, codigo), relogio.agora());
  }

  // Entrega mensagens pendentes só se a autorização ainda vale no momento do envio.
  async function despachar(cons) {
    const itens = await repos.saida.listar(cons);
    const enviados = [];
    for (const item of itens.filter((i) => i.estado === 'pendente')) {
      if (!item.sempre) {
        if ((await autorizacao(cons, item.pacienteCodigo)) !== 'ativa') { await repos.saida.bloquear(cons, item.id, 'sem_liberacao'); continue; }
        const conv = await repos.conversas.obter(cons, item.pacienteCodigo);
        if (conv && (conv.estado === 'atendimento_humano' || conv.estado === 'revogado')) { await repos.saida.bloquear(cons, item.id, 'automacao_pausada'); continue; }
      }
      try { await repos.saida.entregar(cons, item.id); enviados.push(item.id); } catch (e) { if (!(e instanceof FalhaExterna)) throw e; }
    }
    return enviados;
  }

  async function enfileirar(cons, paciente, chaveBase, saidas, versao) {
    const ids = [];
    let n = 0;
    for (const s of saidas) {
      n += 1;
      const acoes = (s.acoes || []).map((a) => ({ ...a, versao: a.versao === undefined ? versao : a.versao }));
      ids.push(await repos.saida.enfileirar(cons, {
        chave: `${chaveBase}#${n}`, pacienteCodigo: paciente.codigo, canalId: paciente.canalId,
        tipo: s.tipo, texto: s.texto, acoes, sempre: Boolean(s.sempre),
      }));
    }
    return ids;
  }

  // ---- Manipuladores do núcleo (os de agendamento entram em B1.2 por `manipuladores`) ----
  const proprios = {
    async menu() {
      return { conversa: { estado: 'menu' }, saidas: [{ tipo: 'menu', texto: TEXTOS.menu, acoes: acoesMenu() }], resultado: { tipo: 'resposta', acao: 'menu' } };
    },
    async falar_com_nutricionista() {
      return { conversa: { estado: 'atendimento_humano', pausadoPor: 'paciente' }, saidas: [{ tipo: 'aviso_humano', texto: TEXTOS.humano, sempre: true }], resultado: { tipo: 'resposta', acao: 'encaminhado_humano' } };
    },
    async parar(d) {
      await repos.cadastro.revogar(d.cons, d.paciente.codigo, 'paciente', relogio.agora());
      return { conversa: { estado: 'revogado' }, saidas: [{ tipo: 'confirmacao_parar', texto: TEXTOS.parar, sempre: true }], resultado: { tipo: 'resposta', acao: 'parado' } };
    },
  };

  function validarEvento(ev) {
    if (!ev || typeof ev !== 'object') throw new ErroNucleo('PEDIDO_INVALIDO');
    if (!C.ehId(ev.eventoId) || !COMANDOS_PACIENTE.includes(ev.comando)) throw new ErroNucleo('PEDIDO_INVALIDO');
    if (ev.chaveIdempotencia !== undefined && !C.ehId(ev.chaveIdempotencia)) throw new ErroNucleo('PEDIDO_INVALIDO');
    const p = ev.parametros === undefined ? {} : ev.parametros;
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new ErroNucleo('PEDIDO_INVALIDO');
    for (const k of Object.keys(p)) if (!PARAMETROS_PERMITIDOS.includes(k)) throw new ErroNucleo('PEDIDO_INVALIDO');
    if (p.opcaoId !== undefined && !C.ehId(p.opcaoId)) throw new ErroNucleo('PEDIDO_INVALIDO');
    if (p.versao !== undefined && !(Number.isInteger(p.versao) && p.versao >= 0 && p.versao < 1e9)) throw new ErroNucleo('PEDIDO_INVALIDO');
    return p;
  }

  const semEfeito = (motivo, estado) => ({ ok: true, tipo: 'sem_efeito', motivo, estado: estado || null, saidas: [] });

  // ---- Evento do paciente ----
  function processarEventoPaciente(ctx, evento) {
    return executar('evento_paciente', async () => {
      const cons = exigirContexto(ctx, 'paciente', evento && evento.consultorioId);
      const parametros = validarEvento(evento);
      const agora = relogio.agora();
      const paciente = await repos.cadastro.buscarPorCanal(cons, ctx.canalId); // vínculo exato, sem aproximar
      if (!paciente) return semEfeito('sem_liberacao');
      const sit = await autorizacao(cons, paciente.codigo);
      if (sit !== 'ativa') { log('evento_paciente', { resultado: 'sem_efeito', codigo: sit, paciente: paciente.codigo }); return semEfeito('sem_liberacao'); }

      const chave = evento.chaveIdempotencia || evento.eventoId;
      // Limite de frequência: só para evento novo (repetição de um já processado não conta), sem resposta ao excesso
      // e nunca para PARAR (a saída do paciente sempre funciona).
      const lim = config.limiteEventos;
      if (lim && evento.comando !== 'parar' && !(await repos.operacoes.obter(cons, chave)) && (await repos.operacoes.contarRecentes(cons, paciente.codigo, agora - lim.janelaMs)) >= lim.max) {
        log('evento_paciente', { resultado: 'sem_efeito', codigo: 'limite_de_frequencia', paciente: paciente.codigo });
        return semEfeito('limite_de_frequencia');
      }
      const imp = C.impressao({ cons, evento: evento.eventoId, paciente: paciente.codigo, comando: evento.comando, parametros });
      const { criada, registro } = await repos.operacoes.iniciar(cons, chave, imp, agora);
      if (!criada) {
        if (registro.impressao !== imp) throw new ErroNucleo('CHAVE_REUTILIZADA');
        if (registro.estado === 'concluida') return { ...registro.resultado, repetido: true };
      } else {
        await repos.operacoes.marcarPaciente(cons, chave, paciente.codigo, evento.comando);
      }

      const conversa = (await repos.conversas.obter(cons, paciente.codigo)) || conversaPadrao();
      const permitidos = COMANDOS_POR_ESTADO[conversa.estado] || [];
      const manipulador = proprios[evento.comando] || manipuladores[evento.comando];
      let resultado;
      if (!permitidos.includes(evento.comando) || !manipulador) {
        resultado = semEfeito('fora_da_etapa', conversa.estado);
      } else {
        const saida = await manipulador({
          cons, paciente, conversa, agora, chave, parametros, repos, config, relogio,
          autorizado: async () => (await autorizacao(cons, paciente.codigo)) === 'ativa',
        });
        let estadoFinal = conversa.estado; let versaoFinal = conversa.versao;
        if (saida.conversa) {
          const novo = { consultaId: conversa.consultaId, ...saida.conversa, atualizadoEm: agora };
          const gravou = await repos.conversas.gravar(cons, paciente.codigo, novo, conversa.versao);
          if (!gravou) {
            // Outra solicitação mudou a conversa: só aceita se o resultado final é o mesmo.
            const atual = await repos.conversas.obter(cons, paciente.codigo);
            if (!(atual && atual.estado === novo.estado && atual.consultaId === novo.consultaId)) throw new FalhaExterna('conversas.versao');
            versaoFinal = atual.versao;
          } else versaoFinal = conversa.versao + 1;
          estadoFinal = novo.estado;
        }
        const saidas = await enfileirar(cons, paciente, chave, saida.saidas || [], versaoFinal);
        resultado = { ok: true, ...saida.resultado, estado: estadoFinal, saidas };
      }
      await repos.operacoes.concluir(cons, chave, resultado);
      log('evento_paciente', { resultado: resultado.tipo, codigo: resultado.motivo || resultado.acao || null, paciente: paciente.codigo });
      await despachar(cons);
      return resultado;
    });
  }

  // ---- Comandos da profissional ----
  function cadastrarPaciente(ctx, pedido) {
    return executar('profissional_cadastro', async () => {
      const cons = exigirContexto(ctx, 'profissional', pedido && pedido.consultorioId);
      const p = await repos.cadastro.cadastrarPaciente(cons, { codigo: pedido.codigoPaciente, nome: pedido.nome });
      return { ok: true, paciente: { codigo: p.codigo } };
    });
  }

  function liberarPaciente(ctx, pedido) {
    return executar('profissional_liberar', async () => {
      const cons = exigirContexto(ctx, 'profissional', pedido && pedido.consultorioId);
      const agora = relogio.agora();
      const ate = C.lerInstanteIso(pedido.validaAte);
      if (ate === null || ate <= agora || ate > agora + config.validadeMaximaDias * 86400000) throw new ErroNucleo('VALIDADE_INVALIDA');
      const lib = await repos.cadastro.liberar(cons, { codigo: pedido.codigoPaciente, canalId: pedido.canalId, validaAte: ate, concedidaPor: ctx.profissionalId, agora });
      const atual = await repos.conversas.obter(cons, pedido.codigoPaciente);
      await repos.conversas.gravar(cons, pedido.codigoPaciente, { estado: 'menu', consultaId: atual && atual.consultaId, atualizadoEm: agora }, atual ? atual.versao : 0);
      log('profissional_liberar', { resultado: 'ok', paciente: pedido.codigoPaciente });
      return { ok: true, liberacao: { id: lib.id, versao: lib.versao, validaAte: lib.validaAte } };
    });
  }

  function revogarLiberacao(ctx, pedido) {
    return executar('profissional_revogar', async () => {
      const cons = exigirContexto(ctx, 'profissional', pedido && pedido.consultorioId);
      if (!C.ehCodigoPaciente(pedido.codigoPaciente)) throw new ErroNucleo('PEDIDO_INVALIDO');
      if (!(await repos.cadastro.obterPaciente(cons, pedido.codigoPaciente))) throw new ErroNucleo('PACIENTE_NAO_ENCONTRADO');
      await repos.cadastro.revogar(cons, pedido.codigoPaciente, ctx.profissionalId, relogio.agora());
      const atual = await repos.conversas.obter(cons, pedido.codigoPaciente);
      await repos.conversas.gravar(cons, pedido.codigoPaciente, { estado: 'revogado', consultaId: atual && atual.consultaId, atualizadoEm: relogio.agora() }, atual ? atual.versao : 0);
      await despachar(cons); // bloqueia respostas automáticas ainda pendentes
      log('profissional_revogar', { resultado: 'ok', paciente: pedido.codigoPaciente });
      return { ok: true };
    });
  }

  async function alterarAtendimento(nome, ctx, pedido, deEstados, paraEstado, extra) {
    return executar(nome, async () => {
      const cons = exigirContexto(ctx, 'profissional', pedido && pedido.consultorioId);
      if (!C.ehCodigoPaciente(pedido.codigoPaciente)) throw new ErroNucleo('PEDIDO_INVALIDO');
      if (!(await repos.cadastro.obterPaciente(cons, pedido.codigoPaciente))) throw new ErroNucleo('PACIENTE_NAO_ENCONTRADO');
      if ((await autorizacao(cons, pedido.codigoPaciente)) !== 'ativa') throw new ErroNucleo('LIBERACAO_INATIVA');
      const atual = (await repos.conversas.obter(cons, pedido.codigoPaciente)) || conversaPadrao();
      if (!deEstados.includes(atual.estado)) return semEfeito('fora_da_etapa', atual.estado);
      const ok = await repos.conversas.gravar(cons, pedido.codigoPaciente, { estado: paraEstado, consultaId: atual.consultaId, atualizadoEm: relogio.agora(), ...extra(ctx) }, atual.versao);
      if (!ok) throw new FalhaExterna('conversas.versao');
      return { ok: true, tipo: 'resposta', estado: paraEstado };
    });
  }
  const ATIVOS = ['menu', 'escolhendo_horario', 'aguardando_confirmacao', 'consulta_confirmada'];
  // Só a profissional do mesmo consultório, com liberação válida, pausa ou retoma a automação.
  const pausarAutomacao = (ctx, pedido) => alterarAtendimento('profissional_pausar', ctx, pedido, ATIVOS, 'atendimento_humano', (c) => ({ pausadoPor: c.profissionalId }));
  const retomarAtendimento = (ctx, pedido) => alterarAtendimento('profissional_retomar', ctx, pedido, ['atendimento_humano'], 'menu', () => ({}));

  function listarPacientes(ctx, pedido) {
    return executar('profissional_listar_pacientes', async () => {
      const cons = exigirContexto(ctx, 'profissional', pedido && pedido.consultorioId);
      const agora = relogio.agora();
      const lista = [];
      for (const p of await repos.cadastro.listarPacientes(cons)) {
        const lib = await repos.cadastro.obterLiberacao(cons, p.codigo);
        const conv = await repos.conversas.obter(cons, p.codigo);
        lista.push({ codigo: p.codigo, nome: p.nome, vinculado: Boolean(p.canalId), liberacao: situacaoLiberacao(lib, agora), validaAte: lib ? lib.validaAte : null, estado: conv ? conv.estado : (lib ? 'menu' : 'sem_liberacao') });
      }
      return { ok: true, pacientes: lista };
    });
  }

  // ---- Painel de atenção (D39): sinais factuais com data; só a profissional do consultório ----
  function listarAtencao(ctx, pedido) {
    return executar('profissional_atencao', async () => {
      const cons = exigirContexto(ctx, 'profissional', pedido && pedido.consultorioId);
      const agora = relogio.agora();
      const consultas = await repos.agenda.listarConsultas(cons);
      const dados = [];
      for (const p of await repos.cadastro.listarPacientes(cons)) {
        const lib = await repos.cadastro.obterLiberacao(cons, p.codigo);
        if (!lib) continue;
        dados.push({ codigo: p.codigo, nome: p.nome, liberacao: situacaoLiberacao(lib, agora), concedidaEm: lib.concedidaEm, validaAte: lib.validaAte, conversa: await repos.conversas.obter(cons, p.codigo), consultas: consultas.filter((c) => c.pacienteCodigo === p.codigo) });
      }
      const regras = { ...config.atencao, ...(pedido.regras || {}) };
      return { ok: true, regras, pacientes: calcularAtencao({ pacientes: dados, agora, regras }) };
    });
  }

  // ---- Consultas: detalhes só para quem tem direito ----
  const visaoConsulta = (c) => ({ id: c.id, pacienteCodigo: c.pacienteCodigo, origemAgenda: c.origemAgenda, inicio: c.inicio, fim: c.fim, status: c.status, canceladaEm: c.canceladaEm || null, motivo: c.motivo || null });

  function listarConsultas(ctx, pedido) {
    return executar('profissional_listar_consultas', async () => {
      const cons = exigirContexto(ctx, 'profissional', pedido && pedido.consultorioId);
      const lista = await repos.agenda.listarConsultas(cons);
      return { ok: true, consultas: lista.map(visaoConsulta) };
    });
  }

  function detalharConsulta(ctx, pedido) {
    return executar('consulta_detalhe', async () => {
      const papel = ctx && ctx.papel === 'paciente' ? 'paciente' : 'profissional';
      const cons = exigirContexto(ctx, papel, pedido && pedido.consultorioId);
      if (!C.ehId(pedido.consultaId)) throw new ErroNucleo('PEDIDO_INVALIDO');
      let dono = null;
      if (papel === 'paciente') {
        dono = await repos.cadastro.buscarPorCanal(cons, ctx.canalId);
        if (!dono || (await autorizacao(cons, dono.codigo)) !== 'ativa') throw new ErroNucleo('NAO_ENCONTRADA');
      }
      const c = await repos.agenda.obterConsulta(cons, pedido.consultaId);
      // Consulta de outro paciente e consulta inexistente são indistinguíveis.
      if (!c || (dono && c.pacienteCodigo !== dono.codigo)) throw new ErroNucleo('NAO_ENCONTRADA');
      const pac = await repos.cadastro.obterPaciente(cons, c.pacienteCodigo);
      return { ok: true, consulta: { ...visaoConsulta(c), pacienteNome: papel === 'profissional' && pac ? pac.nome : undefined } };
    });
  }

  // A profissional cancela uma consulta do SEU consultório. Não envia mensagem nem mexe em cobrança.
  function cancelarConsultaProfissional(ctx, pedido) {
    return executar('profissional_cancelar_consulta', async () => {
      const cons = exigirContexto(ctx, 'profissional', pedido && pedido.consultorioId);
      if (!C.ehId(pedido.consultaId)) throw new ErroNucleo('PEDIDO_INVALIDO');
      const r = await repos.agenda.cancelar(cons, { chave: `prof:${pedido.consultaId}`, consultaId: pedido.consultaId, motivo: 'cancelada_pela_profissional' });
      if (r.estado === 'nao_encontrada') throw new ErroNucleo('NAO_ENCONTRADA');
      if (r.estado === 'passada' || r.estado === 'ja_cancelada') return semEfeito(r.estado === 'passada' ? 'consulta_passada' : 'ja_cancelada');
      log('profissional_cancelar_consulta', { resultado: r.estado });
      return { ok: true, tipo: 'resposta', acao: 'consulta_cancelada', consulta: visaoConsulta(r.consulta), cobranca: 'inalterada', repetido: r.estado === 'existente' };
    });
  }

  // ---- Recuperação: retoma operações pendentes (contexto de sistema) ----
  function reconciliarPendentes(ctx, pedido) {
    return executar('reconciliar', async () => {
      const cons = exigirContexto(ctx, 'sistema', pedido && pedido.consultorioId);
      const resumo = { concluidas: 0, mantidas: 0, descartadas: 0 };
      for (const op of await repos.operacoes.listarPendentes(cons)) {
        const rec = manipuladores.reconciliar && manipuladores.reconciliar[op.comando];
        if (!rec || !op.paciente) continue;
        const r = await rec({ cons, op, repos, agora: relogio.agora(), autorizacao: () => autorizacao(cons, op.paciente) });
        if (r && resumo[r.resultado] !== undefined) resumo[r.resultado] += 1;
      }
      await despachar(cons);
      return { ok: true, ...resumo };
    });
  }

  return {
    processarEventoPaciente, cadastrarPaciente, liberarPaciente, revogarLiberacao, pausarAutomacao, retomarAtendimento,
    listarPacientes, listarAtencao, listarConsultas, detalharConsulta, cancelarConsultaProfissional, reconciliarPendentes, despachar: (ctx, p) => executar('despachar', async () => ({ ok: true, enviados: await despachar(exigirContexto(ctx, 'sistema', p && p.consultorioId)) })),
  };
}

module.exports = { criarNucleo, situacaoLiberacao, COMANDOS_PACIENTE, COMANDOS_POR_ESTADO, TEXTOS, acoesMenu };
