// Item 3 (WA07/D39): painel "precisam de atenção": sinais factuais com data, sem previsão de abandono.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularAtencao } = require('../prototipo/whatsapp/atencao.js');
const { criarCenario, CONS, OUTRO_CONS } = require('../prototipo/whatsapp/cenario.js');

const DIA = 86400000;
const acionar = (c, cod, a) => c.enviar(cod, a.comando, a.comando === 'ver_horarios' ? undefined : { ...(a.opcaoId !== undefined ? { opcaoId: a.opcaoId } : {}), versao: a.versao });
const ultima = async (c, cod, tipo) => { const l = (await c.repos.saida.listar(CONS)).filter((m) => m.pacienteCodigo === cod && m.tipo === tipo); return l[l.length - 1]; };
const atencao = async (c, regras) => (await c.nucleo.listarAtencao(c.prof, { consultorioId: CONS, regras })).pacientes;
const tipos = (l, cod) => (l.find((x) => x.codigo === cod) || { sinais: [] }).sinais.map((s) => s.tipo).sort();

test('quem acabou de ser liberada e ainda está no menu não aparece; o painel não inventa sinais', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(24 * 30));
  assert.deepEqual(await atencao(c), []);
});

test('pediu atendimento humano: aparece com a data; retomar tira do painel', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(24 * 30)); await c.enviar('F001', 'falar_com_nutricionista');
  const l = await atencao(c);
  assert.deepEqual(tipos(l, 'F001'), ['atendimento_humano']);
  assert.match(l[0].sinais[0].texto, /Pediu atendimento humano em \w{3} \d{2}\/\d{2} às \d{2}:\d{2}/);
  await c.nucleo.retomarAtendimento(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.deepEqual(await atencao(c), []);
});

test('pausa pela profissional tem texto próprio', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(24 * 30)); await c.nucleo.pausarAutomacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.match((await atencao(c))[0].sinais[0].texto, /pausada pela profissional/);
});

test('sem resposta: horário oferecido e não confirmado por dias', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(24 * 60)); await c.enviar('F001', 'ver_horarios');
  c.relogio.avancar(1 * DIA);
  assert.deepEqual(await atencao(c), [], 'ainda dentro do prazo');
  c.relogio.avancar(1 * DIA + 1000);
  const l = await atencao(c);
  assert.deepEqual(tipos(l, 'F001'), ['sem_resposta']);
  assert.match(l[0].sinais[0].texto, /Sem resposta desde/);
});

test('sem retorno marcado: desde a liberação e depois desde a última consulta', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(24 * 200));
  c.relogio.avancar(15 * DIA);
  assert.match((await atencao(c)).find((x) => x.codigo === 'F001').sinais.find((s) => s.tipo === 'sem_retorno_marcado').texto, /desde a liberação/);
  await c.enviar('F001', 'ver_horarios');
  await acionar(c, 'F001', (await ultima(c, 'F001', 'opcoes_horario')).acoes[0]);
  await acionar(c, 'F001', (await ultima(c, 'F001', 'pedir_confirmacao')).acoes[0]);
  assert.ok(!tipos(await atencao(c), 'F001').includes('sem_retorno_marcado'), 'com consulta futura, o sinal some');
  const consulta = (await c.repos.agenda.listarConsultas(CONS))[0];
  c.relogio.definir(new Date(consulta.fim + 15 * DIA).toISOString());
  assert.match((await atencao(c)).find((x) => x.codigo === 'F001').sinais.find((s) => s.tipo === 'sem_retorno_marcado').texto, /desde a última, em/);
});

test('validade: aviso antes de vencer e registro depois de expirar; revogada não aparece', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(24 * 5)); await c.liberar('F002', c.horas(24 * 60)); await c.liberar('F003', c.horas(24 * 5));
  await c.nucleo.revogarLiberacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F003' });
  let l = await atencao(c);
  assert.deepEqual(tipos(l, 'F001'), ['liberacao_a_vencer']); assert.deepEqual(tipos(l, 'F002'), []); assert.deepEqual(tipos(l, 'F003'), []);
  c.relogio.avancar(6 * DIA);
  l = await atencao(c);
  assert.deepEqual(tipos(l, 'F001'), ['liberacao_expirada']);
});

test('regras são configuráveis e devolvidas junto (para medir no piloto)', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(24 * 60)); c.relogio.avancar(3 * DIA);
  assert.equal((await atencao(c, { diasSemRetorno: 2 })).length, 1);
  assert.equal((await atencao(c)).length, 0);
  const r = await c.nucleo.listarAtencao(c.prof, { consultorioId: CONS, regras: { diasSemRetorno: 2 } });
  assert.equal(r.regras.diasSemRetorno, 2); assert.equal(r.regras.diasSemResposta, 2);
});

test('ordem: mais sinais primeiro; sem previsão, probabilidade ou nota; só código e nome do cadastro', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(24 * 3)); await c.liberar('F002', c.horas(24 * 90)); await c.enviar('F001', 'falar_com_nutricionista');
  c.relogio.avancar(20 * DIA);
  await c.liberar('F003', c.horas(24 * 90));
  const l = await atencao(c);
  assert.ok(l[0].sinais.length >= l[l.length - 1].sinais.length);
  const bruto = JSON.stringify(l);
  assert.doesNotMatch(bruto, /probabilidade|risco|abandono|score|prever/i);
  assert.ok(!bruto.includes('5511'), 'sem telefone');
  for (const p of l) assert.deepEqual(Object.keys(p).sort(), ['codigo', 'nome', 'sinais']);
});

test('autorização: só a profissional do consultório; outro consultório e paciente são recusados antes do acesso', async () => {
  const c = await criarCenario();
  const antes = c.repos.acessos.length;
  assert.equal((await c.nucleo.listarAtencao(c.ctxPac('F001'), { consultorioId: CONS })).codigo, 'CONTEXTO_INCOMPATIVEL');
  assert.equal((await c.nucleo.listarAtencao(c.confiavel.contextoProfissional(OUTRO_CONS, 'P'), { consultorioId: CONS })).codigo, 'CONTEXTO_INCOMPATIVEL');
  assert.equal((await c.nucleo.listarAtencao(undefined, { consultorioId: CONS })).codigo, 'CONTEXTO_INVALIDO');
  assert.equal(c.repos.acessos.length, antes);
});

test('função pura: pacientes sem liberação ativa não geram sinal de retorno; regras vazias usam o padrão', () => {
  const agora = 100 * DIA;
  const base = { codigo: 'Z1', nome: 'Z', concedidaEm: DIA, validaAte: 1000 * DIA, conversa: null, consultas: [] };
  assert.deepEqual(calcularAtencao({ pacientes: [{ ...base, liberacao: 'revogada' }, { ...base, liberacao: 'nenhuma' }], agora }), []);
  assert.equal(calcularAtencao({ pacientes: [{ ...base, liberacao: 'ativa' }], agora }).length, 1);
});
