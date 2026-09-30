// Itens 1 e 2 (WA01/WA02, parte local): mapeamento dos eventos da Meta e ponte simulada durável.
// Só dados inventados; o diário é um arquivo temporário descartável; nada usa rede.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../prototipo/ponte/meta.js');
const { criarPonte } = require('../prototipo/ponte/ponte.js');
const { criarCenario, CONS, CANAIS } = require('../prototipo/whatsapp/cenario.js');

const SEGREDO = 'segredo-de-teste-nao-real';
const MAPA = { 'PNID-TESTE-1': CONS };

const webhook = (mensagens, extra = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA-TESTE', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '5511000009999', phone_number_id: 'PNID-TESTE-1' }, messages: mensagens, ...extra } }] }],
});
const texto = (id, from, body) => ({ from, id, timestamp: '1790000000', type: 'text', text: { body } });
const botao = (id, from, rid, tipo = 'button_reply') => ({ from, id, timestamp: '1790000000', type: 'interactive', interactive: { type: tipo, [tipo]: { id: rid, title: 'x' } } });
const corpo = (obj) => JSON.stringify(obj);
const enviar = (p, obj) => { const c = corpo(obj); return p.receber(c, M.assinar(c, SEGREDO)); };

async function ambiente(opcoes = {}) {
  const c = await criarCenario();
  const pasta = opcoes.pasta || fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-teste-'));
  const enviadas = [];
  const transporte = { falhar: false, async enviar(m) { if (this.falhar) throw new Error('rede simulada'); enviadas.push(m); } };
  const criar = (extra = {}) => criarPonte({ pasta, segredoApp: SEGREDO, mapaNumeros: MAPA, nucleo: c.nucleo, confiavel: c.confiavel, repos: c.repos, relogio: c.relogio, transporte, ...extra });
  return { c, pasta, enviadas, transporte, criar, ponte: criar() };
}
const limpar = (a) => fs.rmSync(a.pasta, { recursive: true, force: true });

// ---------- Item 1: Meta ----------
test('assinatura: aceita só HMAC correto sobre o corpo bruto; recusa ausente, adulterada, curta ou sem segredo', () => {
  const c = corpo(webhook([texto('w1', CANAIS.F001, 'MENU')]));
  const ok = M.assinar(c, SEGREDO);
  assert.equal(M.verificarAssinatura(c, ok, SEGREDO), true);
  assert.equal(M.verificarAssinatura(Buffer.from(c), ok, SEGREDO), true);
  assert.equal(M.verificarAssinatura(c + ' ', ok, SEGREDO), false, 'corpo alterado');
  assert.equal(M.verificarAssinatura(c, M.assinar(c, 'outro'), SEGREDO), false);
  for (const h of [undefined, '', 'sha256=', 'sha256=abc', ok.replace('sha256=', 'sha1='), ok.toUpperCase().replace('SHA256', 'sha256') + 'zz', 12]) assert.equal(M.verificarAssinatura(c, h, SEGREDO), false, String(h));
  assert.equal(M.verificarAssinatura(c, ok, ''), false);
  assert.equal(M.verificarAssinatura(c, ok, undefined), false);
  assert.equal(M.verificarAssinatura(undefined, ok, SEGREDO), false);
});

test('normalização: texto, botão e lista viram eventos do núcleo; o corpo do texto é descartado', () => {
  const n = M.normalizarWebhook(webhook([
    texto('w1', CANAIS.F001, 'parar'), texto('w2', CANAIS.F001, 'estou com dor, segredo-clinico'),
    botao('w3', CANAIS.F001, 'escolher_horario:h123:4'), botao('w4', CANAIS.F001, 'confirmar:h123:5', 'list_reply'), botao('w5', CANAIS.F001, 'ver_horarios::'),
  ]), MAPA);
  assert.equal(n.ok, true);
  assert.deepEqual(n.eventos.map((e) => e.comando), ['parar', 'texto_livre', 'escolher_horario', 'confirmar', 'ver_horarios']);
  assert.deepEqual(n.eventos[2].parametros, { opcaoId: 'h123', versao: 4 });
  assert.deepEqual(n.eventos[4].parametros, {});
  assert.ok(n.eventos.every((e) => e.consultorioId === CONS && e.canalId === CANAIS.F001));
  assert.ok(!JSON.stringify(n).includes('segredo-clinico') && !JSON.stringify(n).includes('dor'));
  assert.ok(n.eventos.every((e) => /^W[0-9a-f]{40}$/.test(e.eventoId)));
  const a = M.normalizarWebhook(webhook([texto('w1', CANAIS.F001, 'oi')]), MAPA).eventos[0].eventoId;
  const b = M.normalizarWebhook(webhook([texto('w1', CANAIS.F001, 'outro texto')]), MAPA).eventos[0].eventoId;
  assert.equal(a, b, 'mesmo wamid, mesmo id');
});

test('normalização: ids de botão forjados, tipos não suportados, statuses e números desconhecidos', () => {
  const forjados = ['apagar:h1:1', 'confirmar:h1', 'confirmar:h1:1:9', 'confirmar:<b>:1', 'confirmar:h1:-1', 'confirmar:h1:x', 'x'.repeat(200), '', 5];
  const n = M.normalizarWebhook(webhook(forjados.map((r, i) => botao('w' + i, CANAIS.F001, r))), MAPA);
  assert.ok(n.eventos.every((e) => e.comando === 'texto_livre' && Object.keys(e.parametros).length === 0));
  const img = M.normalizarWebhook(webhook([{ from: CANAIS.F001, id: 'wi', type: 'image', image: { id: 'x' } }], { statuses: [{ id: 's1', status: 'read' }] }), MAPA);
  assert.equal(img.eventos[0].comando, 'texto_livre'); assert.equal(img.ignorados, 1);
  const sem = webhook([texto('w9', CANAIS.F001, 'MENU')]); sem.entry[0].changes[0].value.metadata.phone_number_id = 'OUTRO';
  const r = M.normalizarWebhook(sem, MAPA); assert.deepEqual(r.eventos, []); assert.equal(r.ignorados, 1);
  const ruim = [texto('w', '5511abc', 'x'), texto('', CANAIS.F001, 'x'), { from: CANAIS.F001 }, null];
  assert.deepEqual(M.normalizarWebhook(webhook(ruim), MAPA).eventos, []);
  assert.deepEqual(M.normalizarWebhook(webhook([texto('w1', CANAIS.F001, 'x')]), { __proto__: null }).eventos, []);
  assert.deepEqual(M.normalizarWebhook(webhook([texto('w1', CANAIS.F001, 'x')]), { constructor: CONS }).eventos, [], 'mapa não herda do protótipo');
});

test('normalização: estruturas malformadas ou grandes demais são recusadas', () => {
  for (const x of [null, 'x', [], {}, { object: 'page', entry: [] }, { object: 'whatsapp_business_account' }, { object: 'whatsapp_business_account', entry: [{ changes: 'x' }] }, { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: 'x' } }] }] }]) assert.equal(M.normalizarWebhook(x, MAPA).ok, false);
  const muitas = Array.from({ length: M.LIMITES.maxMensagens + 1 }, (_, i) => texto('m' + i, CANAIS.F001, 'oi'));
  assert.equal(M.normalizarWebhook(webhook(muitas), MAPA).ok, false);
});

test('saída: texto simples, até 3 botões, lista acima disso; títulos cortados e sem dado extra', () => {
  const t = M.montarSaidaMeta({ canalId: CANAIS.F001, texto: 'Olá', acoes: [] });
  assert.deepEqual(t, { messaging_product: 'whatsapp', recipient_type: 'individual', to: CANAIS.F001, type: 'text', text: { body: 'Olá', preview_url: false } });
  const b = M.montarSaidaMeta({ canalId: CANAIS.F001, texto: 'Menu', acoes: [{ rotulo: 'Falar com a nutricionista agora', comando: 'falar_com_nutricionista', versao: 2 }, { rotulo: 'Parar', comando: 'parar', versao: 2 }] });
  assert.equal(b.interactive.type, 'button'); assert.equal(b.interactive.action.buttons[0].reply.title.length, M.LIMITES.tituloBotao);
  assert.equal(b.interactive.action.buttons[1].reply.id, 'parar::2');
  const acoes = Array.from({ length: 12 }, (_, i) => ({ rotulo: `qui 01/10 às ${i}:00 horário muito longo`, comando: 'escolher_horario', opcaoId: 'h' + i, versao: 7 }));
  const l = M.montarSaidaMeta({ canalId: CANAIS.F001, texto: 'x'.repeat(5000), acoes });
  assert.equal(l.interactive.type, 'list'); assert.equal(l.interactive.action.sections[0].rows.length, M.LIMITES.linhasLista);
  assert.ok(l.interactive.action.sections[0].rows.every((r) => r.title.length <= M.LIMITES.tituloLinha));
  assert.equal(l.interactive.body.text.length, M.LIMITES.textoCorpo);
  for (const r of l.interactive.action.sections[0].rows) assert.ok(M.decodificarAcao(r.id), 'o id de saída volta como comando válido');
});

// ---------- Item 2: ponte ----------
test('assinatura inválida: 401, nada gravado e o núcleo não é tocado', async () => {
  const a = await ambiente();
  try {
    const c = corpo(webhook([texto('w1', CANAIS.F001, 'MENU')]));
    const antes = a.c.repos.acessos.length;
    for (const h of [undefined, 'sha256=' + '0'.repeat(64), M.assinar(c, 'errado')]) assert.equal(a.ponte.receber(c, h).status, 401);
    assert.equal(a.ponte.diario().length, 0); assert.equal(fs.existsSync(a.ponte.arquivo), false);
    assert.equal((await a.ponte.processarPendentes()).processados, 0);
    assert.equal(a.c.repos.acessos.length, antes);
  } finally { limpar(a); }
});

test('corpo malformado, grande demais ou de tipo errado: 400/413 sem gravar', async () => {
  const a = await ambiente();
  try {
    const assinado = (t) => a.ponte.receber(t, M.assinar(t, SEGREDO));
    assert.equal(assinado('{quebrado').status, 400);
    assert.equal(assinado(corpo({ object: 'page' })).status, 400);
    assert.equal(assinado(corpo({ lixo: 'x'.repeat(M.LIMITES.maxCorpoBytes) })).status, 413);
    assert.equal(a.ponte.diario().length, 0);
  } finally { limpar(a); }
});

test('só responde 200 depois de gravar em disco; se a gravação falha, responde 503 e não registra', async () => {
  const a = await ambiente();
  try {
    const r = enviar(a.ponte, webhook([texto('w1', CANAIS.F001, 'MENU')]));
    assert.equal(r.status, 200);
    assert.equal(fs.readFileSync(a.ponte.arquivo, 'utf8').trim().split('\n').length, 1, 'já está no disco quando o 200 é devolvido');
    const falha = criarPonte({ pasta: fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-teste-')), segredoApp: SEGREDO, mapaNumeros: MAPA, nucleo: a.c.nucleo, confiavel: a.c.confiavel, repos: a.c.repos, relogio: a.c.relogio, transporte: a.transporte, gravar: () => { throw new Error('disco cheio'); } });
    assert.equal(enviar(falha, webhook([texto('w2', CANAIS.F001, 'MENU')])).status, 503);
    assert.equal(falha.diario().length, 0);
    fs.rmSync(path.dirname(falha.arquivo), { recursive: true, force: true });
  } finally { limpar(a); }
});

test('o diário guarda o mínimo: sem texto da conversa, com permissão restrita', async () => {
  const a = await ambiente();
  try {
    enviar(a.ponte, webhook([texto('w1', CANAIS.F001, 'tenho dor no joelho, segredo-clinico'), texto('w2', CANAIS.F001, 'PARAR')]));
    const bruto = fs.readFileSync(a.ponte.arquivo, 'utf8');
    for (const p of ['segredo-clinico', 'joelho', SEGREDO, 'Paciente Fictíc']) assert.ok(!bruto.includes(p), p);
    if (process.platform !== 'win32') assert.equal(fs.statSync(a.ponte.arquivo).mode & 0o077, 0, 'só o dono lê');
  } finally { limpar(a); }
});

test('reenvio do mesmo evento pela Meta: uma entrada no diário e um único efeito', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    const w = webhook([texto('w1', CANAIS.F001, 'MENU')]);
    assert.equal(enviar(a.ponte, w).novos, 1); assert.equal(enviar(a.ponte, w).novos, 0);
    await a.ponte.processarPendentes(); enviar(a.ponte, w); await a.ponte.processarPendentes();
    assert.equal(a.ponte.diario().filter((r) => r.t === 'aceito').length, 1);
    assert.equal((await a.c.repos.saida.listar(CONS)).length, 1);
  } finally { limpar(a); }
});

test('queda antes de processar: outra instância da ponte (mesmo diário) processa uma vez', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    enviar(a.ponte, webhook([texto('w1', CANAIS.F001, 'MENU')]));
    const reiniciada = a.criar(); // "processo novo" lendo o mesmo diário
    const r = await reiniciada.processarPendentes();
    assert.equal(r.processados, 1);
    assert.equal((await reiniciada.processarPendentes()).processados, 0);
    assert.equal((await a.c.repos.saida.listar(CONS)).length, 1);
  } finally { limpar(a); }
});

test('queda depois do núcleo e antes do registro "feito": reprocessar não duplica efeito', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    enviar(a.ponte, webhook([texto('w1', CANAIS.F001, 'MENU')]));
    const p1 = a.criar({ gravar: (l) => { if (JSON.parse(l).t === 'feito') throw new Error('queda'); fs.appendFileSync(a.ponte.arquivo, l + '\n'); } });
    await assert.rejects(() => p1.processarPendentes(), /queda/);
    assert.equal((await a.c.repos.saida.listar(CONS)).length, 1, 'o núcleo já tinha agido');
    const p2 = a.criar(); await p2.processarPendentes();
    assert.equal((await a.c.repos.saida.listar(CONS)).length, 1, 'sem segunda mensagem');
    assert.equal(p2.diario().filter((r) => r.t === 'feito').length, 1);
  } finally { limpar(a); }
});

test('linha final incompleta do diário (queda no meio da escrita) é ignorada', async () => {
  const a = await ambiente();
  try {
    enviar(a.ponte, webhook([texto('w1', CANAIS.F001, 'MENU')]));
    fs.appendFileSync(a.ponte.arquivo, '{"t":"aceito","id":"Wtorto');
    assert.equal(a.criar().diario().length, 1);
    assert.equal(enviar(a.criar(), webhook([texto('w2', CANAIS.F001, 'MENU')])).status, 200);
  } finally { limpar(a); }
});

test('jornada completa pela ponte: liberar -> menu -> horários -> escolher -> confirmar, com botões da Meta de volta', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    let n = 0;
    const passo = async (mensagem) => { enviar(a.ponte, webhook([mensagem])); await a.ponte.processarPendentes(); await a.ponte.enviarSaidas(); n += 1; };
    const ultimaSaida = () => a.enviadas[a.enviadas.length - 1];
    await passo(texto('j1', CANAIS.F001, 'MENU'));
    assert.equal(ultimaSaida().interactive.type, 'button');
    await passo(botao('j2', CANAIS.F001, ultimaSaida().interactive.action.buttons[0].reply.id)); // Ver horários
    assert.equal(ultimaSaida().interactive.type, 'list');
    await passo(botao('j3', CANAIS.F001, ultimaSaida().interactive.action.sections[0].rows[0].id, 'list_reply'));
    assert.match(ultimaSaida().interactive.body.text, /Confirmar consulta/);
    await passo(botao('j4', CANAIS.F001, ultimaSaida().interactive.action.buttons[0].reply.id)); // Confirmar
    assert.match(ultimaSaida().interactive.body.text, /Consulta confirmada/);
    const lista = await a.c.nucleo.listarConsultas(a.c.prof, { consultorioId: CONS });
    assert.equal(lista.consultas.length, 1);
    assert.equal(a.enviadas.length, 4); assert.ok(a.enviadas.every((m) => m.to === CANAIS.F001));
    // reenvio do "confirmar" pela Meta não cria outra consulta nem nova saída
    enviar(a.ponte, webhook([botao('j4', CANAIS.F001, 'confirmar:h1:1')])); await a.ponte.processarPendentes(); await a.ponte.enviarSaidas();
    assert.equal((await a.c.nucleo.listarConsultas(a.c.prof, { consultorioId: CONS })).consultas.length, 1); assert.equal(a.enviadas.length, 4);
  } finally { limpar(a); }
});

test('paciente sem liberação ou de número não mapeado: aceito no diário, sem efeito e sem saída', async () => {
  const a = await ambiente();
  try {
    enviar(a.ponte, webhook([texto('s1', CANAIS.F001, 'MENU'), texto('s2', '5511999999999', 'MENU')]));
    const r = await a.ponte.processarPendentes(); await a.ponte.enviarSaidas();
    assert.equal(r.processados, 2); assert.equal(a.enviadas.length, 0);
    assert.equal((await a.c.repos.saida.listar(CONS)).length, 0);
  } finally { limpar(a); }
});

test('revogação entre a aceitação e o processamento: nenhum efeito nem saída', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    enviar(a.ponte, webhook([texto('r1', CANAIS.F001, 'MENU')]));
    await a.c.nucleo.revogarLiberacao(a.c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
    await a.ponte.processarPendentes(); await a.ponte.enviarSaidas();
    assert.equal(a.enviadas.length, 0); assert.equal((await a.c.repos.saida.listar(CONS)).length, 0);
  } finally { limpar(a); }
});

test('revogação entre o núcleo e o envio: a saída é bloqueada antes de sair', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    enviar(a.ponte, webhook([texto('r2', CANAIS.F001, 'MENU')]));
    await a.ponte.processarPendentes();
    await a.c.nucleo.revogarLiberacao(a.c.prof, { consultorioId: CONS, codigoPaciente: 'F001' });
    const r = await a.ponte.enviarSaidas();
    assert.equal(r.bloqueadas, 1); assert.equal(a.enviadas.length, 0);
  } finally { limpar(a); }
});

test('falha do transporte: a saída fica pendente, tenta de novo e não duplica depois de reiniciar', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    enviar(a.ponte, webhook([texto('t1', CANAIS.F001, 'MENU')]));
    await a.ponte.processarPendentes();
    a.transporte.falhar = true;
    assert.equal((await a.ponte.enviarSaidas()).pendentes, 1); assert.equal(a.enviadas.length, 0);
    a.transporte.falhar = false;
    const nova = a.criar();
    assert.equal((await nova.enviarSaidas()).enviadas, 1);
    assert.equal((await a.criar().enviarSaidas()).enviadas, 0);
    assert.equal(a.enviadas.length, 1);
  } finally { limpar(a); }
});

test('falha temporária repetida do núcleo: tenta de novo e desiste após o limite, sem confirmar nada', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    const esc = async (id, comando, parametros) => { enviar(a.ponte, webhook([botao(id, CANAIS.F001, comando)])); };
    await a.c.enviar('F001', 'ver_horarios'); const conv = await a.c.repos.conversas.obter(CONS, 'F001');
    await a.c.enviar('F001', 'escolher_horario', { opcaoId: conv.opcoes[0].id, versao: conv.versao });
    const c2 = await a.c.repos.conversas.obter(CONS, 'F001');
    await esc('f1', `confirmar:${c2.opcaoEscolhida.id}:${c2.versao}`);
    a.c.repos.falhas.armar('agenda.reservar.antes', 3);
    const p = a.criar({ maxTentativas: 3 });
    assert.equal((await p.processarPendentes()).pendentes, 1);
    assert.equal((await p.processarPendentes()).pendentes, 1);
    assert.equal((await p.processarPendentes()).falhos, 1);
    assert.equal((await a.c.repos.agenda.listarConsultas(CONS)).length, 0);
    assert.equal((await p.processarPendentes()).processados, 0, 'não tenta para sempre');
  } finally { limpar(a); }
});

test('compactação: só descarta eventos concluídos fora da janela de retenção', async () => {
  const a = await ambiente();
  try {
    await a.c.liberar('F001');
    enviar(a.ponte, webhook([texto('c1', CANAIS.F001, 'MENU')])); await a.ponte.processarPendentes();
    a.c.relogio.avancar(2 * 86400000);
    enviar(a.ponte, webhook([texto('c2', CANAIS.F001, 'MENU')]));
    const r = a.ponte.compactar(86400000);
    assert.equal(r.removidos, 1);
    const ids = a.ponte.diario().filter((x) => x.t === 'aceito');
    assert.equal(ids.length, 1, 'o pendente e o recente ficam');
    assert.equal((await a.ponte.processarPendentes()).processados, 1);
  } finally { limpar(a); }
});
