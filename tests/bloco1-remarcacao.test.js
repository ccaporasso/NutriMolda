// Item 2 (WA11, local): remarcar e cancelar pelo núcleo. Propriedade da consulta, confirmação, conflito,
// repetição e recuperação. Nada aqui mexe em cobrança (os resultados dizem `cobranca: 'inalterada'`).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarCenario, CONS, OUTRO_CONS } = require('../prototipo/whatsapp/cenario.js');

const msgs = (c) => c.repos.saida.listar(CONS);
const ultima = async (c, cod, tipo) => { const l = (await msgs(c)).filter((m) => m.pacienteCodigo === cod && (!tipo || m.tipo === tipo)); return l[l.length - 1]; };
const pedido = (a) => { const p = { versao: a.versao }; if (a.opcaoId !== undefined) p.opcaoId = a.opcaoId; return p; };
const acionar = (c, cod, a, id) => c.enviar(cod, a.comando, (a.comando === 'ver_horarios' || a.comando === 'remarcar_consulta' || a.comando === 'cancelar_consulta') ? undefined : pedido(a), id);
const consultas = (c) => c.repos.agenda.listarConsultas(CONS);
const ativas = async (c) => (await consultas(c)).filter((x) => x.status === 'confirmada');

async function agendar(c, cod, indice = 0) {
  await c.liberar(cod); await c.enviar(cod, 'ver_horarios');
  await acionar(c, cod, (await ultima(c, cod, 'opcoes_horario')).acoes[indice]);
  return acionar(c, cod, (await ultima(c, cod, 'pedir_confirmacao')).acoes[0]);
}
const botao = async (c, cod, tipo, comando) => (await ultima(c, cod, tipo)).acoes.find((a) => a.comando === comando);

test('a confirmação da consulta oferece remarcar e cancelar', async () => {
  const c = await criarCenario(); await agendar(c, 'F001');
  assert.deepEqual((await ultima(c, 'F001', 'confirmacao_consulta')).acoes.map((a) => a.comando), ['remarcar_consulta', 'cancelar_consulta', 'menu']);
});

test('remarcar: escolher não troca; só confirmar troca, em um passo, e a consulta antiga fica cancelada como "remarcada"', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001', 0);
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'remarcar_consulta'));
  const ofertas = (await ultima(c, 'F001', 'opcoes_horario')).acoes;
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).remarcando, r0.consultaId);
  await acionar(c, 'F001', ofertas[2]);
  assert.equal((await ativas(c))[0].id, r0.consultaId, 'escolher ainda não troca');
  const r = await acionar(c, 'F001', await botao(c, 'F001', 'pedir_confirmacao', 'confirmar'));
  assert.equal(r.acao, 'consulta_remarcada'); assert.equal(r.cobranca, 'inalterada');
  const todas = await consultas(c);
  const velha = todas.find((x) => x.id === r0.consultaId);
  assert.equal(velha.status, 'cancelada'); assert.equal(velha.motivo, 'remarcada'); assert.equal(velha.substituidaPor, r.consultaId);
  assert.equal((await ativas(c)).length, 1); assert.equal((await ativas(c))[0].id, r.consultaId);
  assert.match((await ultima(c, 'F001', 'confirmacao_consulta')).texto, /Consulta remarcada para/);
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).remarcando, null);
});

test('remarcar: o mesmo evento repetido não cria outra consulta; o horário antigo volta a ser oferecido a outra paciente', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001', 0);
  const horarioAntigo = (await consultas(c))[0].inicio;
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'remarcar_consulta'));
  await acionar(c, 'F001', (await ultima(c, 'F001', 'opcoes_horario')).acoes[2]);
  const conf = await botao(c, 'F001', 'pedir_confirmacao', 'confirmar');
  const a = await acionar(c, 'F001', conf, 'RM-1'); const b = await acionar(c, 'F001', conf, 'RM-1');
  assert.equal(b.repetido, true); assert.equal(b.consultaId, a.consultaId);
  assert.equal((await consultas(c)).length, 2);
  await c.liberar('F002'); await c.enviar('F002', 'ver_horarios');
  assert.ok((await c.repos.conversas.obter(CONS, 'F002')).opcoes.some((o) => o.inicio === horarioAntigo), 'o horário liberado é oferecido');
});

test('remarcar: conflito no novo horário mantém a consulta atual e oferece novas opções', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001', 0);
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'remarcar_consulta'));
  await acionar(c, 'F001', (await ultima(c, 'F001', 'opcoes_horario')).acoes[1]);
  const conf = await botao(c, 'F001', 'pedir_confirmacao', 'confirmar');
  const alvo = (await c.repos.conversas.obter(CONS, 'F001')).opcaoEscolhida;
  c.repos.agenda.bloquear(CONS, alvo.inicio, alvo.fim);
  const r = await acionar(c, 'F001', conf);
  assert.equal(r.acao, 'conflito');
  assert.equal((await ativas(c))[0].id, r0.consultaId, 'continua com a consulta atual');
  const conv = await c.repos.conversas.obter(CONS, 'F001');
  assert.equal(conv.estado, 'escolhendo_horario'); assert.equal(conv.remarcando, r0.consultaId);
  assert.ok(!conv.opcoes.some((o) => o.id === alvo.id));
});

test('remarcar: duas pacientes remarcando para o mesmo horário -> uma vence, a outra mantém a consulta', async () => {
  const c = await criarCenario({ latencia: true });
  await agendar(c, 'F001', 0); await agendar(c, 'F002', 1);
  const confs = {};
  for (const cod of ['F001', 'F002']) {
    await acionar(c, cod, await botao(c, cod, 'confirmacao_consulta', 'remarcar_consulta'));
    const v = await c.repos.conversas.obter(CONS, cod);
    const alvo = v.opcoes[v.opcoes.length - 1]; // o mesmo horário para as duas
    await c.enviar(cod, 'escolher_horario', { opcaoId: alvo.id, versao: v.versao });
    confs[cod] = await botao(c, cod, 'pedir_confirmacao', 'confirmar');
  }
  assert.equal(confs.F001.opcaoId, confs.F002.opcaoId);
  const rs = await Promise.all([acionar(c, 'F001', confs.F001), acionar(c, 'F002', confs.F002)]);
  assert.deepEqual(rs.map((r) => r.acao).sort(), ['conflito', 'consulta_remarcada']);
  assert.equal((await ativas(c)).length, 2);
  assert.deepEqual((await ativas(c)).map((x) => x.pacienteCodigo).sort(), ['F001', 'F002']);
});

test('cancelar: pede confirmação; "manter" volta ao menu sem cancelar; confirmar cancela e não mexe em cobrança', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001');
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'cancelar_consulta'));
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'aguardando_cancelamento');
  assert.equal((await ativas(c)).length, 1, 'pedir não cancela');
  await c.enviar('F001', 'menu');
  assert.equal((await ativas(c)).length, 1);
  await c.enviar('F001', 'ver_horarios'); // quem já tem consulta vê o botão de cancelar de novo
  await acionar(c, 'F001', await botao(c, 'F001', 'consulta_existente', 'cancelar_consulta'));
  const r = await acionar(c, 'F001', await botao(c, 'F001', 'pedir_cancelamento', 'confirmar_cancelamento'));
  assert.equal(r.acao, 'consulta_cancelada'); assert.equal(r.cobranca, 'inalterada');
  assert.equal((await ativas(c)).length, 0);
  assert.equal((await consultas(c))[0].motivo, 'cancelada_pelo_paciente');
  assert.match((await ultima(c, 'F001', 'aviso')).texto, /cancelada/);
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).consultaId, null);
  await c.enviar('F001', 'ver_horarios');
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'escolhendo_horario', 'pode agendar de novo');
});

test('cancelar: repetição do mesmo evento, botão antigo e consulta alheia não têm efeito extra', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001'); await agendar(c, 'F002', 1);
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'cancelar_consulta'));
  const conf = await botao(c, 'F001', 'pedir_cancelamento', 'confirmar_cancelamento');
  // id de consulta alheia forjado no botão: recusado
  const alheia = (await ativas(c)).find((x) => x.pacienteCodigo === 'F002').id;
  assert.equal((await c.enviar('F001', 'confirmar_cancelamento', { opcaoId: alheia, versao: conf.versao })).motivo, 'opcao_invalida');
  assert.equal((await ativas(c)).length, 2);
  assert.equal((await c.enviar('F001', 'confirmar_cancelamento', { opcaoId: conf.opcaoId, versao: conf.versao - 1 })).motivo, 'versao_antiga');
  const a = await acionar(c, 'F001', conf, 'CC-1'); const b = await acionar(c, 'F001', conf, 'CC-1');
  assert.equal(b.repetido, true); assert.equal(a.consultaId, r0.consultaId);
  assert.equal((await ativas(c)).length, 1);
  // botão de cancelamento reenviado depois: fora da etapa
  assert.equal((await acionar(c, 'F001', conf, 'CC-2')).motivo, 'fora_da_etapa');
  assert.equal((await ativas(c))[0].pacienteCodigo, 'F002');
});

test('sem consulta: remarcar e cancelar são ignorados em silêncio', async () => {
  const c = await criarCenario(); await c.liberar('F001'); await c.enviar('F001', 'menu');
  const n = (await msgs(c)).length;
  for (const cmd of ['remarcar_consulta', 'cancelar_consulta']) assert.equal((await c.enviar('F001', cmd)).motivo, 'sem_consulta');
  assert.equal((await msgs(c)).length, n);
  assert.equal((await c.enviar('F001', 'confirmar_cancelamento', { opcaoId: 'C0001', versao: 1 })).motivo, 'fora_da_etapa');
});

test('sem liberação, PARAR, expiração e revogação impedem remarcar e cancelar', async () => {
  const c = await criarCenario(); await agendar(c, 'F001', 0);
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'cancelar_consulta'));
  const conf = await botao(c, 'F001', 'pedir_cancelamento', 'confirmar_cancelamento');
  await c.nucleo.revogarLiberacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.equal((await acionar(c, 'F001', conf)).motivo, 'sem_liberacao');
  assert.equal((await ativas(c)).length, 1, 'a consulta continua');
  assert.equal((await c.enviar('F001', 'remarcar_consulta')).motivo, 'sem_liberacao');
  const d = await criarCenario(); await agendar(d, 'F001');
  await d.enviar('F001', 'parar');
  assert.equal((await d.enviar('F001', 'cancelar_consulta')).motivo, 'sem_liberacao');
  assert.equal((await ativas(d)).length, 1);
});

test('durante o atendimento humano não remarca nem cancela pelo WhatsApp; a profissional cancela pelo painel', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001');
  await c.enviar('F001', 'falar_com_nutricionista');
  assert.equal((await c.enviar('F001', 'cancelar_consulta')).tipo, 'sem_efeito');
  const r = await c.nucleo.cancelarConsultaProfissional(c.prof, { consultorioId: CONS, consultaId: r0.consultaId });
  assert.equal(r.acao, 'consulta_cancelada'); assert.equal(r.cobranca, 'inalterada'); assert.equal(r.consulta.status, 'cancelada'); assert.equal(r.consulta.motivo, 'cancelada_pela_profissional');
  assert.equal((await c.nucleo.cancelarConsultaProfissional(c.prof, { consultorioId: CONS, consultaId: r0.consultaId })).repetido, true, 'repetir não cancela de novo');
  assert.equal((await c.nucleo.cancelarConsultaProfissional(c.prof, { consultorioId: CONS, consultaId: 'C9999' })).codigo, 'NAO_ENCONTRADA');
});

test('profissional de outra clínica ou paciente não cancelam: recusa antes do acesso', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001');
  const antes = c.repos.acessos.length;
  const profB = c.confiavel.contextoProfissional(OUTRO_CONS, 'PB');
  assert.equal((await c.nucleo.cancelarConsultaProfissional(profB, { consultorioId: CONS, consultaId: r0.consultaId })).codigo, 'CONTEXTO_INCOMPATIVEL');
  assert.equal((await c.nucleo.cancelarConsultaProfissional(c.ctxPac('F001'), { consultorioId: CONS, consultaId: r0.consultaId })).codigo, 'CONTEXTO_INCOMPATIVEL');
  assert.equal(c.repos.acessos.length, antes);
  assert.equal((await c.nucleo.cancelarConsultaProfissional(profB, { consultorioId: OUTRO_CONS, consultaId: r0.consultaId })).codigo, 'NAO_ENCONTRADA');
  assert.equal((await ativas(c)).length, 1);
});

test('consulta cancelada pela profissional: o paciente não a "reconfirma" e pode agendar outra', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001');
  const conf = await botao(c, 'F001', 'pedir_confirmacao', 'confirmar');
  await c.nucleo.cancelarConsultaProfissional(c.prof, { consultorioId: CONS, consultaId: r0.consultaId });
  assert.equal((await acionar(c, 'F001', conf, 'RECONF')).motivo, 'consulta_cancelada');
  assert.equal((await c.enviar('F001', 'ver_horarios')).acao, 'opcoes');
  assert.equal((await ativas(c)).length, 0);
});

test('falha depois de cancelar (resultado incerto): repetir ou reconciliar conclui uma vez, sem segunda mensagem', async () => {
  const c = await criarCenario(); await agendar(c, 'F001');
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'cancelar_consulta'));
  const conf = await botao(c, 'F001', 'pedir_cancelamento', 'confirmar_cancelamento');
  c.repos.falhas.armar('agenda.cancelar.depois');
  assert.equal((await acionar(c, 'F001', conf, 'CF-1')).ok, false);
  assert.equal((await ativas(c)).length, 0, 'o cancelamento já valeu');
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'aviso').length, 0, 'sem confirmação falsa antes da hora');
  const rec = await c.nucleo.reconciliarPendentes(c.sistema, { consultorioId: CONS });
  assert.equal(rec.concluidas, 1);
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'menu');
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'aviso').length, 1);
  assert.equal((await acionar(c, 'F001', conf, 'CF-1')).repetido, true);
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'aviso').length, 1);
});

test('falha antes de cancelar: nada muda e repetir conclui; revogação entre falha e reconciliação descarta', async () => {
  const c = await criarCenario(); await agendar(c, 'F001');
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'cancelar_consulta'));
  const conf = await botao(c, 'F001', 'pedir_cancelamento', 'confirmar_cancelamento');
  c.repos.falhas.armar('agenda.cancelar.antes');
  assert.equal((await acionar(c, 'F001', conf, 'CF-2')).tentarDeNovo, true);
  assert.equal((await ativas(c)).length, 1);
  assert.equal((await acionar(c, 'F001', conf, 'CF-2')).acao, 'consulta_cancelada');
  assert.equal((await ativas(c)).length, 0);
  const d = await criarCenario(); await agendar(d, 'F001');
  await acionar(d, 'F001', await botao(d, 'F001', 'confirmacao_consulta', 'cancelar_consulta'));
  const conf2 = await botao(d, 'F001', 'pedir_cancelamento', 'confirmar_cancelamento');
  d.repos.falhas.armar('agenda.cancelar.antes'); await acionar(d, 'F001', conf2, 'CF-3');
  await d.nucleo.revogarLiberacao(d.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.equal((await d.nucleo.reconciliarPendentes(d.sistema, { consultorioId: CONS })).descartadas, 1);
  assert.equal((await ativas(d)).length, 1, 'nada foi cancelado');
});

test('falha depois de remarcar: reconciliação conclui como remarcação, uma consulta ativa e uma mensagem', async () => {
  const c = await criarCenario(); await agendar(c, 'F001', 0);
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'remarcar_consulta'));
  await acionar(c, 'F001', (await ultima(c, 'F001', 'opcoes_horario')).acoes[2]);
  const conf = await botao(c, 'F001', 'pedir_confirmacao', 'confirmar');
  c.repos.falhas.armar('agenda.reservar.depois');
  assert.equal((await acionar(c, 'F001', conf, 'RF-1')).ok, false);
  assert.equal((await ativas(c)).length, 1, 'a troca já valeu, sem duplicar');
  assert.equal((await c.nucleo.reconciliarPendentes(c.sistema, { consultorioId: CONS })).concluidas, 1);
  const conv = await c.repos.conversas.obter(CONS, 'F001');
  assert.equal(conv.estado, 'consulta_confirmada'); assert.equal(conv.remarcando, null);
  assert.match((await ultima(c, 'F001', 'confirmacao_consulta')).texto, /remarcada/);
  assert.equal((await ativas(c)).length, 1);
});

test('"Escolher outro" durante a remarcação continua remarcando; se a consulta some, volta ao menu', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001', 0);
  await acionar(c, 'F001', await botao(c, 'F001', 'confirmacao_consulta', 'remarcar_consulta'));
  await acionar(c, 'F001', (await ultima(c, 'F001', 'opcoes_horario')).acoes[1]);
  const outro = await botao(c, 'F001', 'pedir_confirmacao', 'ver_horarios');
  assert.equal((await acionar(c, 'F001', outro)).acao, 'opcoes');
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).remarcando, r0.consultaId);
  await c.nucleo.cancelarConsultaProfissional(c.prof, { consultorioId: CONS, consultaId: r0.consultaId });
  const r = await c.enviar('F001', 'ver_horarios');
  assert.equal(r.acao, 'sem_consulta'); assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'menu');
});

test('painel de atenção ignora consultas canceladas e lista aparece com status', async () => {
  const c = await criarCenario(); const r0 = await agendar(c, 'F001');
  await c.nucleo.cancelarConsultaProfissional(c.prof, { consultorioId: CONS, consultaId: r0.consultaId });
  const lista = await c.nucleo.listarConsultas(c.prof, { consultorioId: CONS });
  assert.equal(lista.consultas[0].status, 'cancelada'); assert.equal(lista.consultas[0].motivo, 'cancelada_pela_profissional'); assert.ok(lista.consultas[0].canceladaEm);
  c.relogio.avancar(15 * 86400000);
  const at = await c.nucleo.listarAtencao(c.prof, { consultorioId: CONS });
  assert.ok(at.pacientes.find((p) => p.codigo === 'F001').sinais.some((s) => s.tipo === 'sem_retorno_marcado'));
});
