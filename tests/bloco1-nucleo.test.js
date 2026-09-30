// B1.1 (D44): núcleo local de autorização, liberação e estados. Só dados inventados, sem rede.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarCenario, CONS, OUTRO_CONS, CANAIS } = require('../prototipo/whatsapp/cenario.js');
const { criarAdaptadorConfiavel } = require('../prototipo/whatsapp/adaptadores.js');
const C = require('../prototipo/whatsapp/contrato.js');

const mensagens = async (c) => c.repos.saida.listar(CONS);

test('contexto ausente, forjado ou de outra instância é recusado antes de qualquer acesso', async () => {
  const c = await criarCenario();
  const antes = c.repos.acessos.length;
  const forjado = Object.freeze({ papel: 'profissional', consultorioId: CONS, profissionalId: 'X' });
  const estranho = criarAdaptadorConfiavel().contextoProfissional(CONS, 'PROF-1');
  for (const ctx of [undefined, null, forjado, estranho]) {
    const r = await c.nucleo.liberarPaciente(ctx, { consultorioId: CONS, codigoPaciente: 'F001', canalId: CANAIS.F001, validaAte: c.horas(5) });
    assert.equal(r.ok, false); assert.equal(r.codigo, 'CONTEXTO_INVALIDO');
  }
  assert.equal(c.repos.acessos.length, antes, 'recusa deve ocorrer antes de tocar os repositórios');
});

test('profissional de outro consultório não libera nem lê: recusa sem tocar o consultório alvo', async () => {
  const c = await criarCenario();
  const profB = c.confiavel.contextoProfissional(OUTRO_CONS, 'PROF-B');
  const antes = c.repos.acessos.length;
  const r1 = await c.nucleo.liberarPaciente(profB, { consultorioId: CONS, codigoPaciente: 'F001', canalId: CANAIS.F001, validaAte: c.horas(5) });
  const r2 = await c.nucleo.listarPacientes(profB, { consultorioId: CONS });
  assert.equal(r1.codigo, 'CONTEXTO_INCOMPATIVEL'); assert.equal(r2.codigo, 'CONTEXTO_INCOMPATIVEL');
  assert.equal(c.repos.acessos.length, antes);
  const r3 = await c.nucleo.listarPacientes(profB, { consultorioId: OUTRO_CONS });
  assert.deepEqual(r3.pacientes, []);
});

test('papel errado: paciente não usa comandos da profissional e vice-versa', async () => {
  const c = await criarCenario();
  const r = await c.nucleo.liberarPaciente(c.ctxPac('F001'), { consultorioId: CONS, codigoPaciente: 'F001', canalId: CANAIS.F001, validaAte: c.horas(5) });
  assert.equal(r.codigo, 'CONTEXTO_INCOMPATIVEL');
  const r2 = await c.nucleo.processarEventoPaciente(c.prof, { consultorioId: CONS, eventoId: 'E1', comando: 'menu' });
  assert.equal(r2.codigo, 'CONTEXTO_INCOMPATIVEL');
});

test('validade ausente, inválida, passada ou longe demais é recusada', async () => {
  const c = await criarCenario();
  for (const v of [undefined, '', 'amanhã', '2026-10-05', '2026-10-05T10:00:00', c.horas(-1), c.horas(24 * 400), 12345]) {
    const r = await c.nucleo.liberarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: 'F001', canalId: CANAIS.F001, validaAte: v });
    assert.equal(r.codigo, 'VALIDADE_INVALIDA', String(v));
  }
  assert.equal((await c.enviar('F001', 'menu')).motivo, 'sem_liberacao');
});

test('paciente sem liberação, sem vínculo ou de canal desconhecido: nenhum efeito e nenhuma saída', async () => {
  const c = await criarCenario();
  assert.equal((await c.enviar('F001', 'menu')).tipo, 'sem_efeito');
  const desconhecido = c.confiavel.contextoPaciente(CONS, '5511999999999');
  const r = await c.nucleo.processarEventoPaciente(desconhecido, { consultorioId: CONS, eventoId: 'Z1', comando: 'menu' });
  assert.equal(r.tipo, 'sem_efeito');
  assert.equal((await mensagens(c)).length, 0);
  assert.equal(await c.repos.conversas.obter(CONS, 'F001'), null);
});

test('vínculo é exato: variação do número (nono dígito) não encontra o paciente', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  const variacao = c.confiavel.contextoPaciente(CONS, '551100000001');
  const r = await c.nucleo.processarEventoPaciente(variacao, { consultorioId: CONS, eventoId: 'V1', comando: 'menu' });
  assert.equal(r.tipo, 'sem_efeito');
  assert.equal((await mensagens(c)).length, 0);
});

test('mesmo canal ou mesmo paciente com outro vínculo é recusado', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  const r = await c.nucleo.liberarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: 'F002', canalId: CANAIS.F001, validaAte: c.horas(5) });
  assert.equal(r.codigo, 'VINCULO_CONFLITANTE');
  const r2 = await c.nucleo.liberarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: 'F001', canalId: CANAIS.F002, validaAte: c.horas(5) });
  assert.equal(r2.codigo, 'VINCULO_CONFLITANTE');
  const r3 = await c.nucleo.liberarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: 'F404', canalId: '5511000000404', validaAte: c.horas(5) });
  assert.equal(r3.codigo, 'PACIENTE_NAO_ENCONTRADO');
});

test('liberação guarda versão, validade e quem liberou; nova liberação sobe a versão', async () => {
  const c = await criarCenario();
  const a = await c.liberar('F001'); const b = await c.liberar('F001');
  assert.equal(a.liberacao.versao, 1); assert.equal(b.liberacao.versao, 2);
  const lib = await c.repos.cadastro.obterLiberacao(CONS, 'F001');
  assert.equal(lib.concedidaPor, 'PROF-1'); assert.ok(lib.validaAte > c.relogio.agora());
});

test('paciente liberado vê o menu; MENU repete sem mudar de estado', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  const r = await c.enviar('F001', 'menu');
  assert.equal(r.tipo, 'resposta'); assert.equal(r.estado, 'menu');
  const m = await mensagens(c);
  assert.equal(m.length, 1); assert.equal(m[0].estado, 'enviada');
  assert.deepEqual(m[0].acoes.map((a) => a.comando), ['ver_horarios', 'falar_com_nutricionista', 'parar']);
});

test('PARAR revoga; MENU depois não reativa; só nova liberação da profissional reativa', async () => {
  const c = await criarCenario();
  await c.liberar('F001'); await c.enviar('F001', 'menu');
  const p = await c.enviar('F001', 'parar');
  assert.equal(p.estado, 'revogado');
  const antes = (await mensagens(c)).length;
  assert.equal((await c.enviar('F001', 'menu')).tipo, 'sem_efeito');
  assert.equal((await mensagens(c)).length, antes, 'MENU não pode gerar saída');
  assert.equal((await c.nucleo.listarPacientes(c.prof, { consultorioId: CONS })).pacientes[0].liberacao, 'revogada');
  await c.liberar('F001');
  assert.equal((await c.enviar('F001', 'menu')).tipo, 'resposta');
});

test('expiração prevalece sobre qualquer estado', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(2)); await c.enviar('F001', 'menu');
  await c.enviar('F001', 'falar_com_nutricionista');
  c.relogio.avancar(3 * 3600000);
  const antes = (await mensagens(c)).length;
  for (const cmd of ['menu', 'parar', 'falar_com_nutricionista']) assert.equal((await c.enviar('F001', cmd)).motivo, 'sem_liberacao');
  assert.equal((await mensagens(c)).length, antes);
  const r = await c.nucleo.retomarAtendimento(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.equal(r.codigo, 'LIBERACAO_INATIVA');
});

test('atendimento humano pausa; MENU não retoma; só a profissional do mesmo consultório retoma', async () => {
  const c = await criarCenario();
  await c.liberar('F001'); await c.enviar('F001', 'menu');
  const h = await c.enviar('F001', 'falar_com_nutricionista');
  assert.equal(h.estado, 'atendimento_humano');
  const n = (await mensagens(c)).length;
  const m = await c.enviar('F001', 'menu');
  assert.equal(m.tipo, 'sem_efeito'); assert.equal(m.estado, 'atendimento_humano');
  assert.equal((await mensagens(c)).length, n);
  const profB = c.confiavel.contextoProfissional(OUTRO_CONS, 'PROF-B');
  assert.equal((await c.nucleo.retomarAtendimento(profB, { consultorioId: CONS, codigoPaciente: 'F001' })).codigo, 'CONTEXTO_INCOMPATIVEL');
  assert.equal((await c.nucleo.retomarAtendimento(profB, { consultorioId: OUTRO_CONS, codigoPaciente: 'F001' })).codigo, 'PACIENTE_NAO_ENCONTRADO');
  const ok = await c.nucleo.retomarAtendimento(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  assert.equal(ok.estado, 'menu');
  assert.equal((await c.enviar('F001', 'menu')).tipo, 'resposta');
});

test('profissional pode pausar a automação; retomar exige estar pausado', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  assert.equal((await c.nucleo.retomarAtendimento(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' })).tipo, 'sem_efeito');
  assert.equal((await c.nucleo.pausarAutomacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' })).estado, 'atendimento_humano');
  assert.equal((await c.enviar('F001', 'menu')).tipo, 'sem_efeito');
});

test('PARAR ainda funciona durante o atendimento humano', async () => {
  const c = await criarCenario();
  await c.liberar('F001'); await c.enviar('F001', 'falar_com_nutricionista');
  assert.equal((await c.enviar('F001', 'parar')).estado, 'revogado');
});

test('comando fora da etapa e resposta antiga de botão não gravam nem geram saída', async () => {
  const c = await criarCenario();
  await c.liberar('F001'); await c.enviar('F001', 'menu');
  const n = (await mensagens(c)).length;
  const v = (await c.repos.conversas.obter(CONS, 'F001')).versao;
  for (const cmd of ['confirmar', 'escolher_horario', 'texto_livre']) assert.equal((await c.enviar('F001', cmd, cmd === 'texto_livre' ? undefined : { opcaoId: 'h1', versao: 0 })).motivo, 'fora_da_etapa');
  assert.equal((await mensagens(c)).length, n);
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).versao, v);
});

test('evento repetido devolve o mesmo resultado sem nova saída; mesma chave com conteúdo diferente é recusada', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  const a = await c.enviar('F001', 'menu', undefined, 'EV-1');
  const b = await c.enviar('F001', 'menu', undefined, 'EV-1');
  assert.equal(b.repetido, true); assert.deepEqual(b.saidas, a.saidas);
  assert.equal((await mensagens(c)).length, 1);
  const d = await c.enviar('F001', 'falar_com_nutricionista', undefined, 'EV-1');
  assert.equal(d.codigo, 'CHAVE_REUTILIZADA');
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'menu');
});

test('forma do evento: tipo, id e parâmetros fora do contrato são recusados', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  const ctx = c.ctxPac('F001');
  const ruins = [
    { consultorioId: CONS, eventoId: 'E1', comando: 'apagar_tudo' },
    { consultorioId: CONS, eventoId: '', comando: 'menu' },
    { consultorioId: CONS, eventoId: 'a b', comando: 'menu' },
    { consultorioId: CONS, eventoId: 'E2', comando: 'menu', parametros: { texto: 'oi' } },
    { consultorioId: CONS, eventoId: 'E3', comando: 'confirmar', parametros: { opcaoId: '<b>x</b>' } },
    { consultorioId: CONS, eventoId: 'E4', comando: 'confirmar', parametros: { versao: -1 } },
    { consultorioId: CONS, eventoId: 'E5', comando: 'menu', parametros: [] },
    { consultorioId: CONS, eventoId: 'E6', comando: 'menu', chaveIdempotencia: '!' },
    null, 'texto',
  ];
  for (const ev of ruins) assert.equal((await c.nucleo.processarEventoPaciente(ctx, ev)).ok, false);
  assert.equal((await mensagens(c)).length, 0);
});

test('comandoDeTexto reconhece só PARAR e MENU e descarta o resto', () => {
  assert.equal(C.comandoDeTexto('  parar '), 'parar');
  assert.equal(C.comandoDeTexto('Menu'), 'menu');
  assert.equal(C.comandoDeTexto('olá, tenho dor'), 'texto_livre');
  assert.equal(C.comandoDeTexto(undefined), 'texto_livre');
});

test('registro e erros não contêm telefone, corpo de mensagem, nome ou segredo, nem com entrada malformada', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  const lixo = '<script>alert(1)</script> segredo-123 dor de cabeça';
  const respostas = [
    await c.nucleo.processarEventoPaciente(c.ctxPac('F001'), { consultorioId: CONS, eventoId: lixo, comando: lixo, parametros: { opcaoId: lixo } }),
    await c.nucleo.liberarPaciente(c.prof, { consultorioId: CONS, codigoPaciente: lixo, canalId: lixo, validaAte: lixo }),
    await c.nucleo.processarEventoPaciente(c.ctxPac('F001'), { consultorioId: CONS, eventoId: 'OK1', comando: 'menu' }),
  ];
  const tudo = JSON.stringify([c.logs, respostas.map((r) => ({ codigo: r.codigo, mensagem: r.mensagem }))]);
  for (const proibido of [lixo, 'segredo-123', 'dor de cabeça', CANAIS.F001, 'Paciente Fictíc', '<script>']) assert.ok(!tudo.includes(proibido), proibido);
  assert.ok(c.logs.length > 0);
});

test('falha inesperada no adaptador vira resposta neutra, sem texto da exceção', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  c.repos.cadastro.buscarPorCanal = async () => { throw new Error('senha=abc telefone 5511000000001'); };
  const r = await c.enviar('F001', 'menu');
  assert.equal(r.codigo, 'ERRO_INTERNO');
  assert.ok(!JSON.stringify([r, c.logs]).includes('senha') && !JSON.stringify(c.logs).includes('5511'));
});

test('revogação pela profissional bloqueia respostas pendentes e mantém o estado consistente', async () => {
  const c = await criarCenario();
  await c.liberar('F001');
  c.repos.falhas.armar('saida.entregar.antes', 1);
  await c.enviar('F001', 'menu');
  assert.equal((await mensagens(c))[0].estado, 'pendente');
  await c.nucleo.revogarLiberacao(c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
  const m = await mensagens(c);
  assert.equal(m[0].estado, 'bloqueada'); assert.equal(m[0].motivo, 'sem_liberacao');
  assert.equal((await c.repos.conversas.obter(CONS, 'F001')).estado, 'revogado');
});

test('relógio injetado: liberação expira no instante exato da validade', async () => {
  const c = await criarCenario();
  await c.liberar('F001', c.horas(1));
  c.relogio.avancar(3600000 - 1);
  assert.equal((await c.enviar('F001', 'menu')).tipo, 'resposta');
  c.relogio.avancar(1);
  assert.equal((await c.enviar('F001', 'menu')).tipo, 'sem_efeito');
});

test('isolamento entre consultórios: mesmo código de paciente e mesmo canal em outro consultório não se misturam', async () => {
  const c = await criarCenario();
  const profB = c.confiavel.contextoProfissional(OUTRO_CONS, 'PROF-B');
  await c.nucleo.cadastrarPaciente(profB, { consultorioId: OUTRO_CONS, codigoPaciente: 'F001', nome: 'Outro' });
  await c.liberar('F001');
  const r = await c.nucleo.processarEventoPaciente(c.confiavel.contextoPaciente(OUTRO_CONS, CANAIS.F001), { consultorioId: OUTRO_CONS, eventoId: 'X1', comando: 'menu' });
  assert.equal(r.tipo, 'sem_efeito');
});
