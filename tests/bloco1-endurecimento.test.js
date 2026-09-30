// Item 5: limite de frequência, rotação do segredo da ponte e carga local com muitas pacientes em paralelo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../prototipo/ponte/meta.js');
const { criarPonte } = require('../prototipo/ponte/ponte.js');
const { criarCenario, CONS } = require('../prototipo/whatsapp/cenario.js');

test('limite de frequência: excesso de eventos novos é ignorado em silêncio; repetição de evento antigo e outros pacientes não são afetados', async () => {
  const c = await criarCenario();
  await c.liberar('F001'); await c.liberar('F002');
  const max = 30;
  for (let i = 0; i < max; i += 1) assert.equal((await c.enviar('F001', 'menu', undefined, `L${i}`)).tipo, 'resposta');
  const n = (await c.repos.saida.listar(CONS)).length;
  const r = await c.enviar('F001', 'menu', undefined, 'L-excesso');
  assert.equal(r.motivo, 'limite_de_frequencia');
  assert.equal((await c.repos.saida.listar(CONS)).length, n, 'sem resposta ao excesso');
  assert.equal((await c.enviar('F001', 'menu', undefined, 'L0')).repetido, true, 'repetição de evento já processado passa');
  assert.equal((await c.enviar('F002', 'menu')).tipo, 'resposta');
  c.relogio.avancar(61000);
  assert.equal((await c.enviar('F001', 'menu', undefined, 'L-depois')).tipo, 'resposta', 'a janela passa');
  assert.ok(!JSON.stringify(c.logs).includes('5511'));
});

test('PARAR nunca é barrado pelo limite de frequência', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  for (let i = 0; i < 30; i += 1) await c.enviar('F001', 'menu', undefined, `P${i}`);
  assert.equal((await c.enviar('F001', 'menu', undefined, 'P-x')).motivo, 'limite_de_frequencia');
  assert.equal((await c.enviar('F001', 'parar', undefined, 'P-parar')).estado, 'revogado');
  assert.equal((await c.nucleo.listarPacientes(c.prof, { consultorioId: CONS })).pacientes[0].liberacao, 'revogada');
});

test('rotação de segredo: o anterior vale até ser retirado da lista; segredos vazios são ignorados', () => {
  const corpo = '{"a":1}';
  const velho = M.assinar(corpo, 'segredo-velho'); const novo = M.assinar(corpo, 'segredo-novo');
  assert.equal(M.verificarAssinatura(corpo, velho, ['segredo-novo', 'segredo-velho']), true);
  assert.equal(M.verificarAssinatura(corpo, novo, ['segredo-novo', 'segredo-velho']), true);
  assert.equal(M.verificarAssinatura(corpo, velho, ['segredo-novo']), false);
  assert.equal(M.verificarAssinatura(corpo, velho, ['', undefined, null]), false);
  assert.equal(M.verificarAssinatura(corpo, velho, []), false);
  assert.equal(M.verificarAssinatura(corpo, velho, 'segredo-velho'), true, 'forma antiga (um segredo) continua valendo');
});

test('ponte com lista de segredos: durante a rotação aceita os dois; depois só o novo', async () => {
  const c = await criarCenario();
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-rot-'));
  try {
    const base = { pasta, mapaNumeros: { P1: CONS }, nucleo: c.nucleo, confiavel: c.confiavel, repos: c.repos, relogio: c.relogio, transporte: { enviar: async () => {} } };
    const corpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const dois = criarPonte({ ...base, segredosApp: ['novo', 'velho'] });
    assert.equal(dois.receber(corpo, M.assinar(corpo, 'velho')).status, 200);
    assert.equal(dois.receber(corpo, M.assinar(corpo, 'novo')).status, 200);
    const so = criarPonte({ ...base, segredosApp: ['novo'] });
    assert.equal(so.receber(corpo, M.assinar(corpo, 'velho')).status, 401);
  } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
});

test('carga local: 40 pacientes agendando em paralelo terminam com uma consulta cada, sem sobreposição nem duplicação', async () => {
  const c = await criarCenario({ latencia: true });
  const codigos = Array.from({ length: 40 }, (_, i) => `G${String(i).padStart(3, '0')}`);
  const canal = (i) => `55119${String(i).padStart(8, '0')}`;
  for (const [i, g] of codigos.entries()) {
    await c.nucleo.cadastrarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: g, nome: `Carga ${i}` });
    await c.nucleo.liberarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: g, canalId: canal(i), validaAte: c.horas(48) });
  }
  const ctx = (i) => c.confiavel.contextoPaciente(CONS, canal(i));
  let seq = 0;
  const ev = (i, comando, parametros) => c.nucleo.processarEventoPaciente(ctx(i), { consultorioId: CONS, eventoId: `CG${++seq}`, comando, parametros });
  const temConsulta = new Set();
  for (let rodada = 0; rodada < 60 && temConsulta.size < codigos.length; rodada += 1) {
    const faltam = codigos.map((g, i) => i).filter((i) => !temConsulta.has(i));
    // todos pedem horários e escolhem (em paralelo); depois todos confirmam (em paralelo)
    await Promise.all(faltam.map((i) => ev(i, 'ver_horarios')));
    await Promise.all(faltam.map(async (i) => { const cv = await c.repos.conversas.obter(CONS, codigos[i]); if (cv && cv.estado === 'escolhendo_horario') await ev(i, 'escolher_horario', { opcaoId: cv.opcoes[i % cv.opcoes.length].id, versao: cv.versao }); }));
    await Promise.all(faltam.map(async (i) => { const cv = await c.repos.conversas.obter(CONS, codigos[i]); if (cv && cv.estado === 'aguardando_confirmacao') await ev(i, 'confirmar', { opcaoId: cv.opcaoEscolhida.id, versao: cv.versao }); }));
    for (const i of faltam) { const cv = await c.repos.conversas.obter(CONS, codigos[i]); if (cv && cv.estado === 'consulta_confirmada') temConsulta.add(i); }
    c.relogio.avancar(61000); // a janela do limite de frequência passa entre as rodadas
  }
  assert.equal(temConsulta.size, codigos.length, 'todas terminaram agendadas');
  const lista = await c.repos.agenda.listarConsultas(CONS);
  assert.equal(lista.length, 40);
  assert.equal(new Set(lista.map((x) => x.pacienteCodigo)).size, 40, 'uma por paciente');
  assert.equal(new Set(lista.map((x) => x.id)).size, 40);
  const ord = [...lista].sort((a, b) => a.inicio - b.inicio);
  for (let i = 1; i < ord.length; i += 1) assert.ok(ord[i].inicio >= ord[i - 1].fim, 'sem sobreposição de horários');
});
