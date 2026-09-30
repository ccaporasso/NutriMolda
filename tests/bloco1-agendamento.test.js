// B1.2 (D44): agendamento com adaptadores simulados: disponibilidade, confirmação, idempotência,
// disputa de horário e recuperação de falhas. Só dados inventados, sem rede.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarCenario, CONS, OUTRO_CONS, CANAIS } = require('../prototipo/whatsapp/cenario.js');
const C = require('../prototipo/whatsapp/contrato.js');

const msgs = (c) => c.repos.saida.listar(CONS);
const ultima = async (c, cod, tipo) => { const l = (await msgs(c)).filter((m) => m.pacienteCodigo === cod && (!tipo || m.tipo === tipo)); return l[l.length - 1]; };
const pedido = (a) => { const p = { versao: a.versao }; if (a.opcaoId !== undefined) p.opcaoId = a.opcaoId; return p; };
const acionar = (c, cod, a, eventoId) => c.enviar(cod, a.comando, a.comando === 'ver_horarios' ? undefined : pedido(a), eventoId);
const consultas = (c) => c.repos.agenda.listarConsultas(CONS);

// Leva o paciente até "aguardando confirmação" e devolve o botão Confirmar.
async function ateConfirmar(c, cod, indice = 0) {
  await c.liberar(cod);
  await c.enviar(cod, 'ver_horarios');
  const opcoes = (await ultima(c, cod, 'opcoes_horario')).acoes;
  await acionar(c, cod, opcoes[indice]);
  return (await ultima(c, cod, 'pedir_confirmacao')).acoes[0];
}

test('jornada completa: liberar -> escolher -> confirmar -> consulta na lista e nos detalhes', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  assert.equal(conf.comando, 'confirmar');
  assert.equal((await consultas(c)).length, 0, 'escolher não reserva');
  const r = await acionar(c, 'F001', conf);
  assert.equal(r.acao, 'consulta_confirmada'); assert.equal(r.estado, 'consulta_confirmada');
  const lista = await c.nucleo.listarConsultas(c.prof, { consultorioId: CONS });
  assert.equal(lista.consultas.length, 1);
  const det = await c.nucleo.detalharConsulta(c.prof, { consultorioId: CONS, consultaId: r.consultaId });
  assert.equal(det.consulta.id, lista.consultas[0].id); assert.equal(det.consulta.pacienteCodigo, 'F001');
  assert.equal(det.consulta.origemAgenda, 'agenda_simulada'); assert.equal(det.consulta.status, 'confirmada');
  const meu = await c.nucleo.detalharConsulta(c.ctxPac('F001'), { consultorioId: CONS, consultaId: r.consultaId });
  assert.equal(meu.ok, true); assert.equal(meu.consulta.pacienteNome, undefined, 'paciente não recebe campos da profissional');
  assert.match((await ultima(c, 'F001', 'confirmacao_consulta')).texto, /Consulta confirmada para/);
});

test('jornada completa termina em encaminhamento humano que pausa a automação', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001'); await acionar(c, 'F001', conf);
  assert.equal((await c.enviar('F001', 'falar_com_nutricionista')).estado, 'atendimento_humano');
  const n = (await msgs(c)).length;
  assert.equal((await c.enviar('F001', 'ver_horarios')).tipo, 'sem_efeito');
  assert.equal((await msgs(c)).length, n);
  assert.equal((await consultas(c)).length, 1, 'a consulta continua');
});

test('paciente A não lê consulta de B; consulta alheia e inexistente são indistinguíveis', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001'); const ok = await acionar(c, 'F001', conf);
  await c.liberar('F002');
  const alheia = await c.nucleo.detalharConsulta(c.ctxPac('F002'), { consultorioId: CONS, consultaId: ok.consultaId });
  const inexistente = await c.nucleo.detalharConsulta(c.ctxPac('F002'), { consultorioId: CONS, consultaId: 'C9999' });
  assert.equal(alheia.codigo, 'NAO_ENCONTRADA'); assert.deepEqual(alheia, inexistente);
  const semLiberacao = await c.nucleo.detalharConsulta(c.ctxPac('F003'), { consultorioId: CONS, consultaId: ok.consultaId });
  assert.equal(semLiberacao.codigo, 'NAO_ENCONTRADA');
});

test('profissional de outra clínica não lista nem lê consultas: recusa antes do registro protegido', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001'); const ok = await acionar(c, 'F001', conf);
  const profB = c.confiavel.contextoProfissional(OUTRO_CONS, 'PROF-B');
  const antes = c.repos.acessos.length;
  assert.equal((await c.nucleo.listarConsultas(profB, { consultorioId: CONS })).codigo, 'CONTEXTO_INCOMPATIVEL');
  assert.equal((await c.nucleo.detalharConsulta(profB, { consultorioId: CONS, consultaId: ok.consultaId })).codigo, 'CONTEXTO_INCOMPATIVEL');
  assert.equal(c.repos.acessos.length, antes);
  assert.equal((await c.nucleo.detalharConsulta(profB, { consultorioId: OUTRO_CONS, consultaId: ok.consultaId })).codigo, 'NAO_ENCONTRADA');
  assert.deepEqual((await c.nucleo.listarConsultas(profB, { consultorioId: OUTRO_CONS })).consultas, []);
});

test('mesmo evento repetido e confirmação repetida: uma única consulta', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  const a = await acionar(c, 'F001', conf, 'CONF-1');
  const b = await acionar(c, 'F001', conf, 'CONF-1');
  assert.equal(b.repetido, true); assert.equal(b.consultaId, a.consultaId);
  const d = await acionar(c, 'F001', conf, 'CONF-2'); // outro evento, mesmo botão
  assert.equal(d.consultaId, a.consultaId); assert.equal(d.acao, 'consulta_ja_confirmada');
  assert.equal((await consultas(c)).length, 1);
  const x = await c.enviar('F001', 'confirmar', { opcaoId: 'h1', versao: conf.versao }, 'CONF-1');
  assert.equal(x.codigo, 'CHAVE_REUTILIZADA');
});

test('quem já tem consulta não marca outra: ver horários mostra a existente', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001'); const ok = await acionar(c, 'F001', conf);
  const r = await c.enviar('F001', 'ver_horarios');
  assert.equal(r.acao, 'ja_tem_consulta'); assert.equal(r.consultaId, ok.consultaId);
  assert.equal((await consultas(c)).length, 1);
});

test('disputa real: duas confirmações concorrentes no mesmo horário -> uma reserva e um conflito', async () => {
  const c = await criarCenario({ latencia: true });
  const confA = await ateConfirmar(c, 'F001', 0);
  const confB = await ateConfirmar(c, 'F002', 0);
  assert.equal(confA.opcaoId, confB.opcaoId, 'as duas pessoas escolheram o mesmo horário');
  const [ra, rb] = await Promise.all([acionar(c, 'F001', confA), acionar(c, 'F002', confB)]);
  const acoes = [ra.acao, rb.acao].sort();
  assert.deepEqual(acoes, ['conflito', 'consulta_confirmada']);
  assert.equal((await consultas(c)).length, 1);
  const perdedor = ra.acao === 'conflito' ? 'F001' : 'F002';
  const conv = await c.repos.conversas.obter(CONS, perdedor);
  assert.equal(conv.estado, 'escolhendo_horario');
  assert.ok(!conv.opcoes.some((o) => o.id === confA.opcaoId), 'horário ocupado deixa de ser confirmável');
  const velha = await acionar(c, perdedor, confA);
  assert.equal(velha.tipo, 'sem_efeito');
  assert.equal((await consultas(c)).length, 1);
});

test('confirmações simultâneas do mesmo paciente (eventos diferentes) geram uma só consulta', async () => {
  const c = await criarCenario({ latencia: true });
  const conf = await ateConfirmar(c, 'F001');
  const rs = await Promise.all([acionar(c, 'F001', conf, 'P-1'), acionar(c, 'F001', conf, 'P-2'), acionar(c, 'F001', conf, 'P-1')]);
  assert.ok(rs.every((r) => r.ok !== false || r.tentarDeNovo), JSON.stringify(rs));
  assert.equal((await consultas(c)).length, 1);
});

test('horário ocupado por fora depois da oferta: escolher e confirmar não reservam', async () => {
  const c = await criarCenario();
  await c.liberar('F001'); await c.enviar('F001', 'ver_horarios');
  const opcoes = (await ultima(c, 'F001', 'opcoes_horario')).acoes;
  const conv = await c.repos.conversas.obter(CONS, 'F001');
  const alvo = conv.opcoes[0];
  c.repos.agenda.bloquear(CONS, alvo.inicio, alvo.fim);
  const r = await acionar(c, 'F001', opcoes[0]);
  assert.equal(r.acao, 'conflito');
  assert.equal((await consultas(c)).length, 0);
  // segundo caso: ocupado entre escolher e confirmar
  const novas = (await ultima(c, 'F001', 'opcoes_horario')).acoes;
  await acionar(c, 'F001', novas[0]);
  const conf = (await ultima(c, 'F001', 'pedir_confirmacao')).acoes[0];
  const escolhida = (await c.repos.conversas.obter(CONS, 'F001')).opcaoEscolhida;
  c.repos.agenda.bloquear(CONS, escolhida.inicio, escolhida.fim);
  assert.equal((await acionar(c, 'F001', conf)).acao, 'conflito');
  assert.equal((await consultas(c)).length, 0);
});

test('sem horários livres: resposta clara e nenhuma opção', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  c.repos.agenda.bloquear(CONS, 0, 1e15);
  const r = await c.enviar('F001', 'ver_horarios');
  assert.equal(r.acao, 'sem_horarios'); assert.equal(r.estado, 'menu');
});

test('falha antes de gravar: nada confirmado; repetir depois da recuperação conclui uma vez', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  c.repos.falhas.armar('agenda.reservar.antes');
  const r = await acionar(c, 'F001', conf, 'CF-1');
  assert.equal(r.ok, false); assert.equal(r.tentarDeNovo, true);
  assert.equal((await consultas(c)).length, 0);
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'confirmacao_consulta').length, 0, 'sem confirmação falsa');
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'aguardando_confirmacao');
  const ok = await acionar(c, 'F001', conf, 'CF-1');
  assert.equal(ok.acao, 'consulta_confirmada');
  assert.equal((await consultas(c)).length, 1);
});

test('falha depois de reservar (resultado incerto): repetir encontra a reserva e não cria outra', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  c.repos.falhas.armar('agenda.reservar.depois');
  const r = await acionar(c, 'F001', conf, 'CF-2');
  assert.equal(r.ok, false);
  assert.equal((await consultas(c)).length, 1, 'a reserva já valeu');
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'confirmacao_consulta').length, 0);
  const ok = await acionar(c, 'F001', conf, 'CF-2');
  assert.equal(ok.acao, 'consulta_confirmada');
  assert.equal((await consultas(c)).length, 1);
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'confirmacao_consulta').length, 1);
});

test('falha ao registrar a conversa depois de reservar: reconciliação conclui sem duplicar', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  c.repos.falhas.armar('conversas.gravar');
  assert.equal((await acionar(c, 'F001', conf, 'CF-3')).ok, false);
  assert.equal((await consultas(c)).length, 1);
  const rec = await c.nucleo.reconciliarPendentes(c.sistema, { consultorioId: CONS });
  assert.equal(rec.concluidas, 1);
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'consulta_confirmada');
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'confirmacao_consulta').length, 1);
  assert.equal((await consultas(c)).length, 1);
  assert.equal((await c.nucleo.reconciliarPendentes(c.sistema, { consultorioId: CONS })).concluidas, 0, 'idempotente');
});

test('retomada: novo processador com os mesmos repositórios simulados conclui a operação pendente', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  c.repos.falhas.armar('agenda.reservar.depois');
  await acionar(c, 'F001', conf, 'CF-4');
  const novo = c.recriarNucleo();
  const r = await novo.processarEventoPaciente(c.ctxPac('F001'), { consultorioId: CONS, eventoId: 'CF-4', comando: 'confirmar', parametros: pedido(conf) });
  assert.equal(r.acao, 'consulta_confirmada');
  assert.equal((await consultas(c)).length, 1);
});

test('resposta pendente é revalidada antes do envio: revogação bloqueia a confirmação já enfileirada', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  c.repos.falhas.armar('saida.entregar.antes'); // a mensagem de confirmação fica na fila
  await acionar(c, 'F001', conf);
  assert.equal((await ultima(c, 'F001', 'confirmacao_consulta')).estado, 'pendente');
  await c.nucleo.revogarLiberacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.equal((await ultima(c, 'F001', 'confirmacao_consulta')).estado, 'bloqueada');
  assert.equal((await consultas(c)).length, 1, 'revogar não desfaz a consulta gravada');
});

test('revogação depois de reservar e antes de registrar: consulta mantida, sem saída automática', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  c.repos.falhas.armar('agenda.reservar.depois');
  await acionar(c, 'F001', conf, 'RV-1');
  await c.nucleo.revogarLiberacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  const rec = await c.nucleo.reconciliarPendentes(c.sistema, { consultorioId: CONS });
  assert.equal(rec.mantidas, 1);
  assert.equal((await consultas(c)).length, 1);
  assert.equal((await msgs(c)).filter((m) => m.tipo === 'confirmacao_consulta').length, 0);
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'revogado');
  assert.equal((await acionar(c, 'F001', conf, 'RV-1')).tipo, 'sem_efeito');
});

test('revogação sem reserva: a operação pendente é descartada e nada é criado', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  c.repos.falhas.armar('agenda.reservar.antes');
  await acionar(c, 'F001', conf, 'RV-2');
  await c.nucleo.revogarLiberacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.equal((await c.nucleo.reconciliarPendentes(c.sistema, { consultorioId: CONS })).descartadas, 1);
  assert.equal((await consultas(c)).length, 0);
});

test('entradas inválidas: opção forjada, posição no lugar de ID, versão antiga e evento fora de ordem não têm efeito', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  const fora = await c.enviar('F001', 'confirmar', { opcaoId: 'h1', versao: 1 });
  assert.equal(fora.motivo, 'fora_da_etapa');
  await c.enviar('F001', 'ver_horarios');
  const v = (await c.repos.conversas.obter(CONS, 'F001')).versao;
  const real = (await c.repos.conversas.obter(CONS, 'F001')).opcoes[0].id;
  assert.equal((await c.enviar('F001', 'escolher_horario', { opcaoId: 'h1', versao: v })).motivo, 'opcao_invalida');
  assert.equal((await c.enviar('F001', 'escolher_horario', { opcaoId: '1', versao: v })).motivo, 'opcao_invalida');
  assert.equal((await c.enviar('F001', 'escolher_horario', { opcaoId: real, versao: v - 1 })).motivo, 'versao_antiga');
  assert.equal((await c.enviar('F001', 'escolher_horario', { opcaoId: real })).motivo, 'pedido_incompleto');
  assert.equal((await c.enviar('F001', 'confirmar', { opcaoId: real, versao: v })).motivo, 'fora_da_etapa');
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'escolhendo_horario');
  assert.equal((await consultas(c)).length, 0);
});

test('botão antigo: confirmar com versão desatualizada é ignorado', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  await c.enviar('F001', 'ver_horarios'); // muda a versão da conversa
  assert.equal((await acionar(c, 'F001', conf)).tipo, 'sem_efeito');
  assert.equal((await consultas(c)).length, 0);
});

test('horário que já passou entre a escolha e a confirmação não é reservado', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  const esc = (await c.repos.conversas.obter(CONS, 'F001')).opcaoEscolhida;
  c.relogio.definir(new Date(esc.inicio + 60000).toISOString());
  assert.equal((await acionar(c, 'F001', conf)).motivo, 'horario_passado');
  assert.equal((await consultas(c)).length, 0);
});

test('a agenda simulada recusa datas inválidas, passadas ou fora da grade mesmo chamada direto', async () => {
  const c = await criarCenario();
  const passado = c.relogio.agora() - 3600000;
  for (const [ini, fim] of [[passado, passado + 3000000], [NaN, 5], ['x', 'y'], [c.relogio.agora() + 1, c.relogio.agora() + 2], [1.5, 2.5]]) {
    await assert.rejects(() => c.repos.agenda.reservar(CONS, { chave: 'K', pacienteCodigo: 'F001', inicio: ini, fim }), (e) => e.codigo === 'PEDIDO_INVALIDO');
  }
  assert.equal((await consultas(c)).length, 0);
});

test('PARAR entre a seleção e a confirmação impede o agendamento', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  await c.enviar('F001', 'parar');
  assert.equal((await acionar(c, 'F001', conf)).motivo, 'sem_liberacao');
  assert.equal((await consultas(c)).length, 0);
});

test('expiração entre a seleção e a confirmação impede o agendamento', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(3));
  await c.enviar('F001', 'ver_horarios');
  const a = (await ultima(c, 'F001', 'opcoes_horario')).acoes[0];
  await acionar(c, 'F001', a);
  const conf = (await ultima(c, 'F001', 'pedir_confirmacao')).acoes[0];
  c.relogio.avancar(4 * 3600000);
  assert.equal((await acionar(c, 'F001', conf)).motivo, 'sem_liberacao');
  assert.equal((await consultas(c)).length, 0);
});

test('revogação pela profissional entre a seleção e a confirmação impede o agendamento', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001');
  await c.nucleo.revogarLiberacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.equal((await acionar(c, 'F001', conf)).motivo, 'sem_liberacao');
  assert.equal((await consultas(c)).length, 0);
});

test('liberação de outro consultório não dá acesso: o canal não agenda no consultório errado', async () => {
  const c = await criarCenario();
  const profB = c.confiavel.contextoProfissional(OUTRO_CONS, 'PROF-B');
  await c.nucleo.cadastrarPaciente(profB, { consultorioId: OUTRO_CONS, codigoPaciente: 'F001', nome: 'Outro' });
  await c.nucleo.liberarPaciente(profB, { consultorioId: OUTRO_CONS, codigoPaciente: 'F001', canalId: CANAIS.F001, validaAte: c.horas(24) });
  const r = await c.enviar('F001', 'ver_horarios'); // consultório A, paciente sem liberação lá
  assert.equal(r.tipo, 'sem_efeito');
  assert.equal((await consultas(c)).length, 0);
});

test('fim de dia e virada de data em America/Sao_Paulo', () => {
  // 22:30 de 01/10 (quinta) em São Paulo já é 02/10 em UTC: "hoje" continua sendo 01/10 local.
  const noite = Date.parse('2026-10-02T01:30:00Z');
  assert.equal(C.formatarInstante(noite), 'qui 01/10 às 22:30');
  assert.equal(C.formatarInstante(C.gerarHorarios(noite)[0].inicio), 'sex 02/10 às 09:00');
  // sexta 11:30 local: só segunda em diante (sexta encerra às 12:00, e não há sábado/domingo)
  const sexta = Date.parse('2026-10-02T14:30:00Z');
  assert.equal(C.formatarInstante(C.gerarHorarios(sexta)[0].inicio), 'seg 05/10 às 09:00');
  // janela até 23:59 com horários encostando na meia-noite local
  const cfg = { ...C.CONFIG_TESTE, antecedenciaMin: 0, diasAFrente: 0, janelas: { 4: [['22:00', '23:59']] } };
  const tarde = Date.parse('2026-10-01T23:00:00Z'); // 20:00 local
  const slots = C.gerarHorarios(tarde, cfg).map((h) => C.formatarInstante(h.inicio));
  assert.deepEqual(slots, ['qui 01/10 às 22:00', 'qui 01/10 às 23:00']);
  // a mesma janela passada das 23:00 não oferece nada para o dia que acabou
  assert.deepEqual(C.gerarHorarios(Date.parse('2026-10-02T02:30:00Z'), cfg), []);
});

test('duração e intervalo vêm da configuração', () => {
  const cfg = { ...C.CONFIG_TESTE, antecedenciaMin: 0, diasAFrente: 0, duracaoMin: 30, intervaloMin: 0, janelas: { 4: [['09:00', '11:00']] } };
  const h = C.gerarHorarios(Date.parse('2026-10-01T10:00:00Z'), cfg); // 07:00 local
  assert.deepEqual(h.map((x) => C.formatarInstante(x.inicio).slice(-5)), ['09:00', '09:30', '10:00', '10:30']);
  assert.ok(h.every((x) => x.fim - x.inicio === 30 * 60000));
});

test('saídas de agendamento não vazam telefone nem nome nos registros', async () => {
  const c = await criarCenario();
  const conf = await ateConfirmar(c, 'F001'); await acionar(c, 'F001', conf);
  const log = JSON.stringify(c.logs);
  for (const p of [CANAIS.F001, 'Paciente Fictíc', 'Consulta confirmada']) assert.ok(!log.includes(p), p);
});
