// Suíte de CONTRATO dos repositórios do núcleo (item 1/WA03). Toda implementação (em memória, planilha simulada e,
// no futuro, o adaptador Google) precisa passar aqui. É o que o núcleo assume; não prova nada sobre o Google real.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../prototipo/whatsapp/contrato.js');

const CONS = 'CONS-A'; const OUTRO = 'CONS-B';

function definirContrato(nome, fabrica) {
  const t = (titulo, fn) => test(`[contrato ${nome}] ${titulo}`, fn);
  const slots = (x, n = 3) => C.gerarHorarios(x.relogio.agora(), C.CONFIG_TESTE).slice(0, n);

  t('cadastro: cadastrar é idempotente, vínculo é exato e conflitos são recusados', async () => {
    const { repos: r } = await fabrica();
    await r.cadastro.cadastrarPaciente(CONS, { codigo: 'X001', nome: 'Um' }); await r.cadastro.cadastrarPaciente(CONS, { codigo: 'X001', nome: 'Outro nome' });
    assert.equal((await r.cadastro.listarPacientes(CONS)).length, 1);
    assert.equal((await r.cadastro.obterPaciente(CONS, 'X001')).nome, 'Um');
    await r.cadastro.cadastrarPaciente(CONS, { codigo: 'X002', nome: 'Dois' });
    const lib = await r.cadastro.liberar(CONS, { codigo: 'X001', canalId: '5511000000101', validaAte: 5000, concedidaPor: 'P1', agora: 1000 });
    assert.equal(lib.versao, 1); assert.equal(lib.revogadaEm, null);
    assert.equal((await r.cadastro.buscarPorCanal(CONS, '5511000000101')).codigo, 'X001');
    assert.equal(await r.cadastro.buscarPorCanal(CONS, '551100000101'), null);
    assert.equal(await r.cadastro.buscarPorCanal(CONS, undefined), null);
    await assert.rejects(() => r.cadastro.liberar(CONS, { codigo: 'X002', canalId: '5511000000101', validaAte: 5000, concedidaPor: 'P1', agora: 1 }), (e) => e.codigo === 'VINCULO_CONFLITANTE');
    await assert.rejects(() => r.cadastro.liberar(CONS, { codigo: 'X001', canalId: '5511000000102', validaAte: 5000, concedidaPor: 'P1', agora: 1 }), (e) => e.codigo === 'VINCULO_CONFLITANTE');
    await assert.rejects(() => r.cadastro.liberar(CONS, { codigo: 'NAO1', canalId: '5511000000103', validaAte: 5000, concedidaPor: 'P1', agora: 1 }), (e) => e.codigo === 'PACIENTE_NAO_ENCONTRADO');
    await assert.rejects(() => r.cadastro.liberar(CONS, { codigo: 'X002', canalId: 'abc', validaAte: 5000, concedidaPor: 'P1', agora: 1 }), (e) => e.codigo === 'PEDIDO_INVALIDO');
  });

  t('cadastro: nova liberação sobe a versão; revogar devolve true uma vez e sobe a versão', async () => {
    const { repos: r } = await fabrica();
    await r.cadastro.cadastrarPaciente(CONS, { codigo: 'X001', nome: 'Um' });
    await r.cadastro.liberar(CONS, { codigo: 'X001', canalId: '5511000000101', validaAte: 5000, concedidaPor: 'P1', agora: 1000 });
    assert.equal((await r.cadastro.liberar(CONS, { codigo: 'X001', canalId: '5511000000101', validaAte: 9000, concedidaPor: 'P2', agora: 2000 })).versao, 2);
    assert.equal(await r.cadastro.revogar(CONS, 'X001', 'P2', 3000), true);
    assert.equal(await r.cadastro.revogar(CONS, 'X001', 'P2', 3100), false);
    const l = await r.cadastro.obterLiberacao(CONS, 'X001');
    assert.equal(l.revogadaEm, 3000); assert.equal(l.revogadaPor, 'P2'); assert.equal(l.versao, 3); assert.equal(l.validaAte, 9000); assert.equal(l.concedidaPor, 'P2');
    assert.equal(await r.cadastro.revogar(CONS, 'SEM1', 'P2', 1), false);
    assert.equal(await r.cadastro.obterLiberacao(CONS, 'SEM1'), null);
  });

  t('conversas: gravação condicional por versão e cópias independentes', async () => {
    const { repos: r } = await fabrica();
    assert.equal(await r.conversas.obter(CONS, 'X001'), null);
    assert.equal(await r.conversas.gravar(CONS, 'X001', { estado: 'menu', opcoes: [{ id: 'h1', inicio: 1, fim: 2 }] }, 0), true);
    assert.equal(await r.conversas.gravar(CONS, 'X001', { estado: 'menu' }, 0), false, 'versão velha');
    const c = await r.conversas.obter(CONS, 'X001');
    assert.equal(c.versao, 1); assert.deepEqual(c.opcoes, [{ id: 'h1', inicio: 1, fim: 2 }]);
    c.opcoes.push('lixo'); c.estado = 'mexido';
    assert.equal((await r.conversas.obter(CONS, 'X001')).estado, 'menu', 'alterar a cópia não altera o repositório');
    assert.equal(await r.conversas.gravar(CONS, 'X001', { estado: 'escolhendo_horario' }, 1), true);
    assert.equal((await r.conversas.obter(CONS, 'X001')).versao, 2);
  });

  t('conversas: duas gravações concorrentes com a mesma versão -> só uma vence', async () => {
    const { repos: r } = await fabrica(true);
    const rs = await Promise.all([r.conversas.gravar(CONS, 'X001', { estado: 'a' }, 0), r.conversas.gravar(CONS, 'X001', { estado: 'b' }, 0)]);
    assert.deepEqual(rs.filter(Boolean).length, 1);
  });

  t('operações: iniciar cria uma vez, concluir guarda o resultado, pendentes e contagem recente', async () => {
    const { repos: r } = await fabrica();
    const a = await r.operacoes.iniciar(CONS, 'K1', 'imp1', 100); const b = await r.operacoes.iniciar(CONS, 'K1', 'imp2', 200);
    assert.equal(a.criada, true); assert.equal(b.criada, false); assert.equal(b.registro.impressao, 'imp1');
    await r.operacoes.marcarPaciente(CONS, 'K1', 'X001', 'menu');
    assert.equal((await r.operacoes.listarPendentes(CONS)).length, 1);
    assert.equal(await r.operacoes.contarRecentes(CONS, 'X001', 50), 1); assert.equal(await r.operacoes.contarRecentes(CONS, 'X001', 101), 0); assert.equal(await r.operacoes.contarRecentes(CONS, 'X999', 0), 0);
    await r.operacoes.concluir(CONS, 'K1', { ok: true, tipo: 'resposta', saidas: ['M0001'] });
    const o = await r.operacoes.obter(CONS, 'K1');
    assert.equal(o.estado, 'concluida'); assert.deepEqual(o.resultado, { ok: true, tipo: 'resposta', saidas: ['M0001'] });
    assert.equal((await r.operacoes.listarPendentes(CONS)).length, 0);
    assert.equal(await r.operacoes.obter(CONS, 'NAO'), null);
    await r.operacoes.iniciar(CONS, 'K2', 'i', 300); await r.operacoes.concluir(CONS, 'K2', null, 'descartada');
    assert.equal((await r.operacoes.obter(CONS, 'K2')).estado, 'descartada');
  });

  t('saída: enfileirar é idempotente pela chave; entregar e bloquear só agem em pendente', async () => {
    const { repos: r } = await fabrica();
    const msg = { chave: 'K#1', pacienteCodigo: 'X001', canalId: '5511000000101', tipo: 'menu', texto: 'Olá', acoes: [{ rotulo: 'a', comando: 'menu', versao: 1 }], sempre: false };
    const id = await r.saida.enfileirar(CONS, msg);
    assert.equal(await r.saida.enfileirar(CONS, msg), id);
    const id2 = await r.saida.enfileirar(CONS, { ...msg, chave: 'K#2' });
    assert.notEqual(id2, id);
    await r.saida.entregar(CONS, id); await r.saida.bloquear(CONS, id, 'tarde');
    await r.saida.bloquear(CONS, id2, 'sem_liberacao'); await r.saida.entregar(CONS, id2);
    const l = await r.saida.listar(CONS);
    assert.equal(l.find((x) => x.id === id).estado, 'enviada'); assert.equal(l.find((x) => x.id === id2).estado, 'bloqueada'); assert.equal(l.find((x) => x.id === id2).motivo, 'sem_liberacao');
    assert.deepEqual(l[0].acoes, msg.acoes); assert.equal(l[0].texto, 'Olá'); assert.equal(l[0].canalId, msg.canalId); assert.equal(l[0].sempre, false);
  });

  t('agenda: reservar é idempotente pela chave, recusa conflito e segundo horário do mesmo paciente', async () => {
    const x = await fabrica(); const r = x.repos; const [s1, s2] = slots(x);
    const a = await r.agenda.reservar(CONS, { chave: 'K1', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim });
    assert.equal(a.estado, 'reservada'); assert.equal(a.consulta.status, 'confirmada'); assert.equal(a.consulta.pacienteCodigo, 'X001'); assert.equal(a.consulta.consultorioId, CONS);
    const b = await r.agenda.reservar(CONS, { chave: 'K1', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim });
    assert.equal(b.estado, 'existente'); assert.equal(b.consulta.id, a.consulta.id);
    assert.equal((await r.agenda.reservar(CONS, { chave: 'K2', pacienteCodigo: 'X002', inicio: s1.inicio, fim: s1.fim })).estado, 'conflito');
    assert.equal((await r.agenda.reservar(CONS, { chave: 'K3', pacienteCodigo: 'X001', inicio: s2.inicio, fim: s2.fim })).estado, 'paciente_ja_tem');
    assert.equal((await r.agenda.listarConsultas(CONS)).length, 1);
    assert.equal((await r.agenda.buscarPorChave(CONS, 'K1')).id, a.consulta.id); assert.equal(await r.agenda.buscarPorChave(CONS, 'nao'), null);
    assert.equal((await r.agenda.obterConsulta(CONS, a.consulta.id)).inicio, s1.inicio); assert.equal(await r.agenda.obterConsulta(CONS, 'C9999'), null);
    assert.equal((await r.agenda.consultaAtiva(CONS, 'X001')).id, a.consulta.id); assert.equal(await r.agenda.consultaAtiva(CONS, 'X002'), null);
  });

  t('agenda: disponibilidade respeita consultas e bloqueios externos; datas inválidas são recusadas', async () => {
    const x = await fabrica(); const r = x.repos; const [s1, s2] = slots(x);
    assert.equal((await r.agenda.listarDisponiveis(CONS, 2)).length, 2);
    r.agenda.bloquear(CONS, s1.inicio, s1.fim);
    assert.equal(await r.agenda.estaDisponivel(CONS, s1.inicio, s1.fim), false); assert.equal(await r.agenda.estaDisponivel(CONS, s2.inicio, s2.fim), true);
    const ofertados = await r.agenda.listarDisponiveis(CONS, 5);
    assert.ok(ofertados.every((h) => h.inicio !== s1.inicio));
    const semS2 = await r.agenda.listarDisponiveis(CONS, 5, [`h${Math.floor(s2.inicio / 60000)}`]);
    assert.ok(semS2.every((h) => h.inicio !== s2.inicio));
    assert.equal((await r.agenda.reservar(CONS, { chave: 'B', pacienteCodigo: 'X003', inicio: s1.inicio, fim: s1.fim })).estado, 'conflito');
    for (const [i, f] of [[x.relogio.agora() - 1000, x.relogio.agora() + 1000], [NaN, 5], ['a', 'b'], [s2.inicio + 1, s2.fim + 1], [s2.fim, s2.inicio]]) await assert.rejects(() => r.agenda.reservar(CONS, { chave: 'Z', pacienteCodigo: 'X003', inicio: i, fim: f }), (e) => e.codigo === 'PEDIDO_INVALIDO');
  });

  t('agenda: duas reservas concorrentes do mesmo horário -> uma reservada e um conflito', async () => {
    const x = await fabrica(true); const [s1] = slots(x);
    const rs = await Promise.all(['X001', 'X002', 'X003'].map((p, i) => x.repos.agenda.reservar(CONS, { chave: `K${i}`, pacienteCodigo: p, inicio: s1.inicio, fim: s1.fim })));
    assert.deepEqual(rs.map((r) => r.estado).sort(), ['conflito', 'conflito', 'reservada']);
    assert.equal((await x.repos.agenda.listarConsultas(CONS)).length, 1);
    const mesmaChave = await Promise.all([0, 1, 2].map(() => x.repos.agenda.reservar(CONS, { chave: 'IGUAL', pacienteCodigo: 'X009', inicio: slots(x, 2)[1].inicio, fim: slots(x, 2)[1].fim })));
    assert.equal(new Set(mesmaChave.map((r) => r.consulta.id)).size, 1, 'mesma chave, uma só consulta');
  });

  t('isolamento: o mesmo código, canal e horário em outro consultório não se misturam', async () => {
    const x = await fabrica(); const r = x.repos; const [s1] = slots(x);
    await r.cadastro.cadastrarPaciente(CONS, { codigo: 'X001', nome: 'A' }); await r.cadastro.cadastrarPaciente(OUTRO, { codigo: 'X001', nome: 'B' });
    await r.cadastro.liberar(CONS, { codigo: 'X001', canalId: '5511000000101', validaAte: 9e12, concedidaPor: 'P', agora: 1 });
    assert.equal(await r.cadastro.buscarPorCanal(OUTRO, '5511000000101'), null);
    assert.equal(await r.cadastro.obterLiberacao(OUTRO, 'X001'), null);
    await r.agenda.reservar(CONS, { chave: 'K', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim });
    assert.equal((await r.agenda.listarConsultas(OUTRO)).length, 0);
    assert.equal((await r.agenda.reservar(OUTRO, { chave: 'K', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim })).estado, 'reservada');
    assert.equal((await r.agenda.listarConsultas(OUTRO))[0].consultorioId, OUTRO);
    assert.equal((await r.agenda.listarConsultas(CONS)).length, 1);
    await r.conversas.gravar(CONS, 'X001', { estado: 'menu' }, 0);
    assert.equal(await r.conversas.obter(OUTRO, 'X001'), null);
  });

  t('falhas injetadas lançam FalhaExterna no ponto pedido; reservar "depois" já gravou', async () => {
    const x = await fabrica(); const r = x.repos; const [s1] = slots(x);
    r.falhas.armar('agenda.reservar.antes');
    await assert.rejects(() => r.agenda.reservar(CONS, { chave: 'F', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim }), (e) => e instanceof C.FalhaExterna);
    assert.equal((await r.agenda.listarConsultas(CONS)).length, 0);
    r.falhas.armar('agenda.reservar.depois');
    await assert.rejects(() => r.agenda.reservar(CONS, { chave: 'F', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim }), (e) => e instanceof C.FalhaExterna);
    assert.equal((await r.agenda.listarConsultas(CONS)).length, 1);
    r.falhas.armar('conversas.gravar');
    await assert.rejects(() => r.conversas.gravar(CONS, 'X001', { estado: 'menu' }, 0), (e) => e instanceof C.FalhaExterna);
    assert.equal(await r.conversas.obter(CONS, 'X001'), null);
    r.falhas.armar('saida.entregar.antes');
    const id = await r.saida.enfileirar(CONS, { chave: 'S', pacienteCodigo: 'X001', canalId: '5511000000101', tipo: 't', texto: 'x', acoes: [], sempre: false });
    await assert.rejects(() => r.saida.entregar(CONS, id), (e) => e instanceof C.FalhaExterna);
    assert.equal((await r.saida.listar(CONS))[0].estado, 'pendente');
  });

  t('agenda: cancelar é atômico, idempotente pela chave e só para o dono; remarcar troca sem deixar o paciente sem consulta', async () => {
    const x = await fabrica(); const r = x.repos; const [s1, s2, s3] = slots(x, 4);
    const a = (await r.agenda.reservar(CONS, { chave: 'K1', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim })).consulta;
    assert.equal((await r.agenda.cancelar(CONS, { chave: 'C1', consultaId: a.id, pacienteCodigo: 'X002' })).estado, 'nao_encontrada', 'outro paciente não cancela');
    assert.equal((await r.agenda.cancelar(CONS, { chave: 'C1', consultaId: 'C9999', pacienteCodigo: 'X001' })).estado, 'nao_encontrada');
    assert.equal((await r.agenda.consultaAtiva(CONS, 'X001')).id, a.id, 'recusas não alteraram nada');
    const c1 = await r.agenda.cancelar(CONS, { chave: 'C1', consultaId: a.id, pacienteCodigo: 'X001', motivo: 'cancelada_pelo_paciente' });
    assert.equal(c1.estado, 'cancelada'); assert.equal(c1.consulta.status, 'cancelada'); assert.equal(c1.consulta.motivo, 'cancelada_pelo_paciente');
    assert.equal((await r.agenda.cancelar(CONS, { chave: 'C1', consultaId: a.id, pacienteCodigo: 'X001' })).estado, 'existente');
    assert.equal((await r.agenda.cancelar(CONS, { chave: 'OUTRA', consultaId: a.id, pacienteCodigo: 'X001' })).estado, 'ja_cancelada');
    assert.equal((await r.agenda.buscarCancelamentoPorChave(CONS, 'C1')).id, a.id); assert.equal(await r.agenda.buscarCancelamentoPorChave(CONS, 'nada'), null);
    assert.equal(await r.agenda.consultaAtiva(CONS, 'X001'), null);
    assert.equal(await r.agenda.estaDisponivel(CONS, s1.inicio, s1.fim), true, 'o horário liberado volta a ser oferecido');
    assert.equal((await r.agenda.reservar(CONS, { chave: 'K2', pacienteCodigo: 'X002', inicio: s1.inicio, fim: s1.fim })).estado, 'reservada');
    assert.equal((await r.agenda.listarConsultas(CONS)).length, 2, 'a cancelada continua registrada');
    // remarcar
    const b = (await r.agenda.reservar(CONS, { chave: 'K3', pacienteCodigo: 'X001', inicio: s2.inicio, fim: s2.fim })).consulta;
    assert.equal((await r.agenda.remarcar(CONS, { chave: 'R0', consultaId: b.id, pacienteCodigo: 'X002', inicio: s3.inicio, fim: s3.fim })).estado, 'nao_encontrada', 'outro paciente não remarca');
    assert.equal((await r.agenda.remarcar(CONS, { chave: 'R0', consultaId: b.id, pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim })).estado, 'conflito', 'horário ocupado');
    assert.equal((await r.agenda.consultaAtiva(CONS, 'X001')).id, b.id, 'conflito não tira a consulta atual');
    assert.equal((await r.agenda.remarcar(CONS, { chave: 'R0', consultaId: b.id, pacienteCodigo: 'X001', inicio: s2.inicio, fim: s2.fim })).estado, 'mesmo_horario');
    const m = await r.agenda.remarcar(CONS, { chave: 'R1', consultaId: b.id, pacienteCodigo: 'X001', inicio: s3.inicio, fim: s3.fim });
    assert.equal(m.estado, 'remarcada'); assert.equal(m.consulta.inicio, s3.inicio); assert.equal(m.anterior.status, 'cancelada'); assert.equal(m.anterior.motivo, 'remarcada'); assert.equal(m.anterior.substituidaPor, m.consulta.id);
    assert.equal((await r.agenda.remarcar(CONS, { chave: 'R1', consultaId: b.id, pacienteCodigo: 'X001', inicio: s3.inicio, fim: s3.fim })).consulta.id, m.consulta.id, 'repetir não cria outra');
    assert.equal((await r.agenda.consultaAtiva(CONS, 'X001')).id, m.consulta.id);
    assert.equal((await r.agenda.listarConsultas(CONS)).filter((c) => c.pacienteCodigo === 'X001' && c.status === 'confirmada').length, 1);
    assert.equal((await r.agenda.buscarPorChave(CONS, 'R1')).id, m.consulta.id);
    await assert.rejects(() => r.agenda.remarcar(CONS, { chave: 'R2', consultaId: m.consulta.id, pacienteCodigo: 'X001', inicio: x.relogio.agora() - 5, fim: x.relogio.agora() + 5 }), (e) => e.codigo === 'PEDIDO_INVALIDO');
    // consulta que já passou não se cancela nem se remarca
    x.relogio.definir(new Date(m.consulta.fim + 1000).toISOString());
    assert.equal((await r.agenda.cancelar(CONS, { chave: 'C9', consultaId: m.consulta.id, pacienteCodigo: 'X001' })).estado, 'passada');
  });

  t('agenda: remarcações concorrentes para o mesmo horário -> uma vence; cancelar e remarcar ao mesmo tempo não dão duas consultas', async () => {
    const x = await fabrica(true); const r = x.repos; const [s1, s2, s3] = slots(x, 4);
    const a = (await r.agenda.reservar(CONS, { chave: 'KA', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim })).consulta;
    const b = (await r.agenda.reservar(CONS, { chave: 'KB', pacienteCodigo: 'X002', inicio: s2.inicio, fim: s2.fim })).consulta;
    const rs = await Promise.all([r.agenda.remarcar(CONS, { chave: 'RA', consultaId: a.id, pacienteCodigo: 'X001', inicio: s3.inicio, fim: s3.fim }), r.agenda.remarcar(CONS, { chave: 'RB', consultaId: b.id, pacienteCodigo: 'X002', inicio: s3.inicio, fim: s3.fim })]);
    assert.deepEqual(rs.map((q) => q.estado).sort(), ['conflito', 'remarcada']);
    assert.equal((await r.agenda.listarConsultas(CONS)).filter((c) => c.status === 'confirmada').length, 2, 'cada paciente segue com uma consulta');
    const y = await fabrica(true); const a2 = (await y.repos.agenda.reservar(CONS, { chave: 'KA', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim })).consulta;
    const [c, m] = await Promise.all([y.repos.agenda.cancelar(CONS, { chave: 'CX', consultaId: a2.id, pacienteCodigo: 'X001' }), y.repos.agenda.remarcar(CONS, { chave: 'RX', consultaId: a2.id, pacienteCodigo: 'X001', inicio: s3.inicio, fim: s3.fim })]);
    const ativas = (await y.repos.agenda.listarConsultas(CONS)).filter((q) => q.status === 'confirmada').length;
    assert.ok(ativas <= 1, `no máximo uma ativa, achou ${ativas}`);
    assert.ok([c.estado, m.estado].includes('cancelada') || [c.estado, m.estado].includes('remarcada'));
  });

  t('agenda: falhas de cancelamento — antes não muda nada; depois já valeu e repetir acha o resultado', async () => {
    const x = await fabrica(); const r = x.repos; const [s1] = slots(x);
    const a = (await r.agenda.reservar(CONS, { chave: 'K1', pacienteCodigo: 'X001', inicio: s1.inicio, fim: s1.fim })).consulta;
    r.falhas.armar('agenda.cancelar.antes');
    await assert.rejects(() => r.agenda.cancelar(CONS, { chave: 'C1', consultaId: a.id, pacienteCodigo: 'X001' }), (e) => e instanceof C.FalhaExterna);
    assert.equal((await r.agenda.consultaAtiva(CONS, 'X001')).id, a.id);
    r.falhas.armar('agenda.cancelar.depois');
    await assert.rejects(() => r.agenda.cancelar(CONS, { chave: 'C1', consultaId: a.id, pacienteCodigo: 'X001' }), (e) => e instanceof C.FalhaExterna);
    assert.equal(await r.agenda.consultaAtiva(CONS, 'X001'), null, 'o cancelamento já tinha valido');
    assert.equal((await r.agenda.cancelar(CONS, { chave: 'C1', consultaId: a.id, pacienteCodigo: 'X001' })).estado, 'existente');
  });
}

module.exports = { definirContrato };
