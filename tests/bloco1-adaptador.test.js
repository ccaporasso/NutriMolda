// Item 1 (WA03, parte de desenho): o mesmo contrato de repositórios passa em duas implementações diferentes
// (em memória e "planilha" com trava e células de texto), e o núcleo completo roda sobre a segunda.
const test = require('node:test');
const assert = require('node:assert/strict');
const { definirContrato } = require('./apoio/contrato-repositorios.js');
const C = require('../prototipo/whatsapp/contrato.js');
const { criarRepositorios } = require('../prototipo/whatsapp/adaptadores.js');
const { criarAgendaSimulada } = require('../prototipo/whatsapp/agenda-simulada.js');
const { criarRepositoriosPlanilha, ABAS } = require('../prototipo/whatsapp/repos-planilha.js');
const { criarCenario, CONS, CANAIS } = require('../prototipo/whatsapp/cenario.js');

const INICIO = '2026-10-01T12:00:00Z';
const fabricaMemoria = async (latencia = false) => {
  const relogio = C.criarRelogio(INICIO); const repos = criarRepositorios({ latencia });
  repos.agenda = criarAgendaSimulada({ falhas: repos.falhas, latencia, relogio, config: C.CONFIG_TESTE });
  return { repos, relogio };
};
const fabricaPlanilha = async (latencia = false) => {
  const relogio = C.criarRelogio(INICIO);
  return { repos: criarRepositoriosPlanilha({ latencia, relogio, config: C.CONFIG_TESTE }), relogio };
};
definirContrato('em memória', fabricaMemoria);
definirContrato('planilha simulada', fabricaPlanilha);

const planilha = (latencia = false) => criarCenario({ latencia, fabricaRepos: ({ latencia: l, relogio, config }) => criarRepositoriosPlanilha({ latencia: l, relogio, config }) });
const msgs = (c) => c.repos.saida.listar(CONS);
const ultima = async (c, cod, tipo) => { const l = (await msgs(c)).filter((m) => m.pacienteCodigo === cod && m.tipo === tipo); return l[l.length - 1]; };
const acionar = (c, cod, a) => c.enviar(cod, a.comando, a.comando === 'ver_horarios' ? undefined : { ...(a.opcaoId !== undefined ? { opcaoId: a.opcaoId } : {}), versao: a.versao });

test('núcleo sobre a planilha simulada: jornada completa, detalhes e encaminhamento humano', async () => {
  const c = await planilha();
  await c.liberar('F001'); await c.enviar('F001', 'ver_horarios');
  await acionar(c, 'F001', (await ultima(c, 'F001', 'opcoes_horario')).acoes[0]);
  const r = await acionar(c, 'F001', (await ultima(c, 'F001', 'pedir_confirmacao')).acoes[0]);
  assert.equal(r.acao, 'consulta_confirmada');
  const lista = await c.nucleo.listarConsultas(c.prof, { consultorioId: CONS });
  assert.equal(lista.consultas.length, 1); assert.equal(lista.consultas[0].origemAgenda, 'planilha_simulada');
  assert.equal((await c.nucleo.detalharConsulta(c.ctxPac('F001'), { consultorioId: CONS, consultaId: r.consultaId })).ok, true);
  await c.liberar('F002');
  assert.equal((await c.nucleo.detalharConsulta(c.ctxPac('F002'), { consultorioId: CONS, consultaId: r.consultaId })).codigo, 'NAO_ENCONTRADA');
  assert.equal((await c.enviar('F001', 'falar_com_nutricionista')).estado, 'atendimento_humano');
  assert.equal((await c.enviar('F001', 'menu')).tipo, 'sem_efeito');
});

test('núcleo sobre a planilha simulada: disputa real pelo mesmo horário (trava) -> uma reserva e um conflito', async () => {
  const c = await planilha(true);
  const conf = {};
  for (const cod of ['F001', 'F002']) {
    await c.liberar(cod); await c.enviar(cod, 'ver_horarios');
    await acionar(c, cod, (await ultima(c, cod, 'opcoes_horario')).acoes[0]);
    conf[cod] = (await ultima(c, cod, 'pedir_confirmacao')).acoes[0];
  }
  const rs = await Promise.all([acionar(c, 'F001', conf.F001), acionar(c, 'F002', conf.F002)]);
  assert.deepEqual(rs.map((r) => r.acao).sort(), ['conflito', 'consulta_confirmada']);
  assert.equal((await c.repos.agenda.listarConsultas(CONS)).length, 1);
});

test('núcleo sobre a planilha simulada: falha depois de reservar é reconciliada sem duplicar; revogação mantém a consulta', async () => {
  const c = await planilha();
  await c.liberar('F001'); await c.enviar('F001', 'ver_horarios');
  await acionar(c, 'F001', (await ultima(c, 'F001', 'opcoes_horario')).acoes[0]);
  const conf = (await ultima(c, 'F001', 'pedir_confirmacao')).acoes[0];
  c.repos.falhas.armar('agenda.reservar.depois');
  assert.equal((await acionar(c, 'F001', conf)).ok, false);
  assert.equal((await c.nucleo.reconciliarPendentes(c.sistema, { consultorioId: CONS })).concluidas, 1);
  assert.equal((await c.repos.agenda.listarConsultas(CONS)).length, 1);
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'confirmacao_consulta').length, 1);
  await c.nucleo.revogarLiberacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.equal((await c.repos.agenda.listarConsultas(CONS)).length, 1);
});

test('planilha simulada: tudo vira texto nas células, cabeçalhos seguem o esquema e fórmulas são neutralizadas', async () => {
  const c = await planilha();
  await c.nucleo.cadastrarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: 'F050', nome: '=IMPORTXML("http://x")' });
  await c.liberar('F001'); await c.enviar('F001', 'menu');
  const aba = c.repos._planilha(CONS);
  for (const [nome, linhas] of Object.entries(aba)) for (const linha of linhas) { assert.equal(linha.length, ABAS[nome].length, nome); for (const cel of linha) assert.equal(typeof cel, 'string', `${nome}: célula não é texto`); }
  const pacientes = aba.Pacientes.map((l) => l[1]);
  assert.ok(pacientes.every((n) => !/^[=+\-@]/.test(n)));
  assert.ok(pacientes.some((n) => n.includes('IMPORTXML')), 'o texto continua legível, só sem ativar fórmula');
  for (const linha of aba.Liberacoes) assert.match(linha[5], /^\d+$/, 'validade guardada como número em texto');
});

test('planilha simulada: a mesma carga de 40 pacientes em paralelo termina sem duplicação nem sobreposição', async () => {
  const c = await planilha(true);
  const canal = (i) => `55119${String(i).padStart(8, '0')}`; const cod = (i) => `H${String(i).padStart(3, '0')}`;
  for (let i = 0; i < 40; i += 1) { await c.nucleo.cadastrarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: cod(i), nome: `N${i}` }); await c.nucleo.liberarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: cod(i), canalId: canal(i), validaAte: c.horas(48) }); }
  let seq = 0; const ev = (i, comando, parametros) => c.nucleo.processarEventoPaciente(c.confiavel.contextoPaciente(CONS, canal(i)), { consultorioId: CONS, eventoId: `PL${++seq}`, comando, parametros });
  const feitos = new Set();
  for (let rodada = 0; rodada < 60 && feitos.size < 40; rodada += 1) {
    const faltam = [...Array(40).keys()].filter((i) => !feitos.has(i));
    await Promise.all(faltam.map((i) => ev(i, 'ver_horarios')));
    await Promise.all(faltam.map(async (i) => { const v = await c.repos.conversas.obter(CONS, cod(i)); if (v.estado === 'escolhendo_horario') await ev(i, 'escolher_horario', { opcaoId: v.opcoes[i % v.opcoes.length].id, versao: v.versao }); }));
    await Promise.all(faltam.map(async (i) => { const v = await c.repos.conversas.obter(CONS, cod(i)); if (v.estado === 'aguardando_confirmacao') await ev(i, 'confirmar', { opcaoId: v.opcaoEscolhida.id, versao: v.versao }); }));
    for (const i of faltam) if ((await c.repos.conversas.obter(CONS, cod(i))).estado === 'consulta_confirmada') feitos.add(i);
    c.relogio.avancar(61000);
  }
  const lista = await c.repos.agenda.listarConsultas(CONS);
  assert.equal(lista.length, 40); assert.equal(new Set(lista.map((x) => x.pacienteCodigo)).size, 40);
  for (let i = 1; i < lista.length; i += 1) assert.ok(lista[i].inicio >= lista[i - 1].fim);
});
