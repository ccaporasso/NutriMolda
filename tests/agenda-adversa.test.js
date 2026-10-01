// Gate B: agenda em cenários adversos, datas e fuso (itens 26, 27 e 28 do roteiro). Só dados inventados. Google simulado (E2).
// Regra de ambiguidade: preferir NÃO associar/agir a associar ao paciente errado ou cancelar a consulta errada.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/Agenda.js');
const F = require('../src/Formatos.js');
const { criarConsultorio } = require('./apoio/fluxo.js');

const janela = G.calcularJanelaAgenda({ ano: 2026, mes: 9, dia: 30 });
const ev = (id, extra = {}) => ({ id, status: 'confirmed', summary: 'Consulta', description: 'paciente: a@exemplo.invalid', start: { dateTime: '2026-10-05T10:00:00-03:00' }, ...extra });
const pacientes = [{ codigo: 'P9001', email: 'a@exemplo.invalid', telefone: '', ativo: true }, { codigo: 'P9002', email: 'b@exemplo.invalid', telefone: '11912345678', ativo: true }];
const plano = (eventos, existentes = [], pacs = pacientes) => G.planejarSincronizacaoAgenda({ eventos, existentes, pacientes: pacs, prefixo: 'Consulta', janela, agoraTexto: '2026-09-30 12:00:00', origemAtual: 'a1' });
const linha = (id, extra = {}) => ({ linha: 2, id_evento: id, data: '2026-10-05', hora: '10:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada', atualizado_em: '', origem: 'a1', ...extra });

// ---------- datas e fuso (item 26) ----------

test('fuso: 23:59 e 00:00 de São Paulo, vindos com offsets diferentes, caem no dia certo', () => {
  const casos = [
    ['2026-09-30T23:59:59-03:00', '2026-09-30', '23:59'], ['2026-10-01T00:00:00-03:00', '2026-10-01', '00:00'],
    ['2026-10-01T02:59:59Z', '2026-09-30', '23:59'], ['2026-10-01T03:00:00Z', '2026-10-01', '00:00'],
    ['2026-10-01T04:00:00+01:00', '2026-10-01', '00:00'], ['2026-09-30T23:30:00-05:00', '2026-10-01', '01:30'],
    ['2026-12-31T23:59:00-03:00', '2026-12-31', '23:59'], ['2027-01-01T02:59:00Z', '2026-12-31', '23:59'], ['2027-01-01T03:00:00Z', '2027-01-01', '00:00'],
    ['2028-02-29T10:00:00-03:00', '2028-02-29', '10:00'], ['2028-03-01T02:59:00Z', '2028-02-29', '23:59'],
    ['2027-02-28T23:59:00-03:00', '2027-02-28', '23:59'], ['2027-03-01T03:00:00Z', '2027-03-01', '00:00'],
  ];
  for (const [entrada, data, hora] of casos) assert.deepEqual(F.dataHoraLocal(entrada), { data, hora }, entrada);
});

test('fuso: instante sem fuso explícito, evento de dia inteiro e texto estranho NÃO viram horário (não depende da máquina)', () => {
  for (const t of ['2026-10-05T10:00:00', '2026-10-05', '', null, undefined, 5, 'ontem', '2026-13-45T10:00:00-03:00', '2026-10-05T25:00:00-03:00']) {
    assert.equal(F.dataHoraLocal(t), null, String(t));
  }
});

test('fuso: o resultado é o mesmo em qualquer fuso da máquina que roda o teste', () => {
  const { execFileSync } = require('node:child_process');
  const codigo = "const F=require('./src/Formatos.js');console.log(JSON.stringify([F.dataHoraLocal('2026-10-01T02:30:00Z'),F.dataHoraLocal('2026-10-05T10:00:00')]))";
  const saidas = new Set(['UTC', 'America/New_York', 'Asia/Tokyo', 'America/Sao_Paulo'].map((TZ) => execFileSync(process.execPath, ['-e', codigo], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, TZ } }).toString()));
  assert.equal(saidas.size, 1);
});

test('datas: fim de mês, ano bissexto e virada do ano na janela e nas somas', () => {
  assert.deepEqual(F.somarDiasNaData({ ano: 2026, mes: 12, dia: 31 }, 1), { ano: 2027, mes: 1, dia: 1 });
  assert.deepEqual(F.somarDiasNaData({ ano: 2028, mes: 2, dia: 28 }, 1), { ano: 2028, mes: 2, dia: 29 });
  assert.deepEqual(F.somarDiasNaData({ ano: 2027, mes: 2, dia: 28 }, 1), { ano: 2027, mes: 3, dia: 1 });
  assert.equal(F.textoParaData('2028-02-29').dia, 29);
  for (const t of ['2027-02-29', '2026-04-31', '2026-00-10', '2026-13-01', '26-01-01']) assert.equal(F.textoParaData(t), null, t);
  assert.equal(G.calcularJanelaAgenda({ ano: 2027, mes: 1, dia: 15 }).verificarDe, '2026-12-16');
});

// ---------- agenda adversa (item 27) ----------

test('evento sem start, de dia inteiro, sem título ou fora do prefixo é ignorado e nunca vira consulta', () => {
  const p = plano([ev('a', { start: undefined }), ev('b', { start: { date: '2026-10-05' } }), ev('c', { summary: undefined }), ev('d', { summary: 'Almoço' })]);
  assert.equal(p.inserir.length, 0);
  assert.equal(p.ignorados, 4);
});

test('evento sem descrição entra como consulta a identificar (sem paciente), sem erro', () => {
  const p = plano([ev('a', { description: undefined })]);
  assert.equal(p.inserir.length, 1);
  assert.equal(p.inserir[0][4], '');
  assert.equal(p.aIdentificar.length, 1);
});

test('id repetido na resposta da agenda gera uma linha só (antes gerava duas)', () => {
  const p = plano([ev('a'), ev('a')]);
  assert.equal(p.inserir.length, 1);
  assert.match(p.avisos.join(' '), /repetido/);
});

test('mesmo id confirmado e cancelado na mesma resposta: não cancela a consulta (contraditório)', () => {
  const p = plano([ev('a'), { id: 'a', status: 'cancelled' }], [linha('a')]);
  assert.equal(p.canceladas, 0);
  const so = plano([{ id: 'a', status: 'cancelled' }], [linha('a')]);
  assert.equal(so.canceladas, 1, 'cancelamento simples continua funcionando');
});

test('ambiguidade: dois pacientes com o mesmo e-mail, o mesmo telefone ou o evento citando os dois: ninguém é associado', () => {
  const dois = [{ codigo: 'P9001', email: 'x@exemplo.invalid', telefone: '', ativo: true }, { codigo: 'P9002', email: 'x@exemplo.invalid', telefone: '', ativo: true }];
  assert.equal(plano([ev('a', { description: 'x@exemplo.invalid' })], [], dois).inserir[0][4], '');
  const tel = [{ codigo: 'P9001', email: '', telefone: '(11) 91234-5678', ativo: true }, { codigo: 'P9002', email: '', telefone: '+55 11 91234-5678', ativo: true }];
  assert.equal(plano([ev('a', { description: 'tel 11 91234-5678' })], [], tel).inserir[0][4], '');
  assert.equal(plano([ev('a', { description: 'a@exemplo.invalid e b@exemplo.invalid' })]).inserir[0][4], '');
});

test('paciente inativo não é associado; ativo com o mesmo e-mail sim', () => {
  const pacs = [{ codigo: 'P9001', email: 'a@exemplo.invalid', telefone: '', ativo: false }];
  assert.equal(plano([ev('a')], [], pacs).inserir[0][4], '');
  assert.equal(plano([ev('a')], [], [{ ...pacs[0], ativo: true }]).inserir[0][4], 'P9001');
});

test('telefone curto, igual só em parte ou com dígitos a mais não identifica ninguém', () => {
  const pacs = [{ codigo: 'P9001', email: '', telefone: '11912345678', ativo: true }];
  for (const d of ['tel 1234567', 'tel 119123456780', 'tel 912345678']) assert.equal(plano([ev('a', { description: d })], [], pacs).inserir[0][4], '', d);
});

function consultorioComEventos(n) {
  const c = criarConsultorio();
  c.eventos.length = 0;
  for (let i = 0; i < n; i++) {
    c.eventos.push({ id: `evt${String(i).padStart(3, '0')}`, status: 'confirmed', summary: 'Consulta', description: '', start: { dateTime: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T${String(8 + (i % 10)).padStart(2, '0')}:00:00-03:00` }, end: { dateTime: '2026-10-28T20:00:00-03:00' } });
  }
  return c;
}

test('paginação: três páginas de eventos entram todas, sem duplicar, e a segunda sincronização não muda nada', () => {
  const c = consultorioComEventos(9);
  const todos = c.eventos.slice();
  const chamadas = [];
  c.amb.contexto.Calendar = { Events: {
    list: (cal, p) => { chamadas.push(p.pageToken); const i = p.pageToken ? Number(p.pageToken) : 0; return { items: todos.slice(i, i + 3), nextPageToken: i + 3 < todos.length ? String(i + 3) : undefined }; },
    get: () => { throw new Error('Not Found'); },
  } };
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').length, 9);
  assert.deepEqual(chamadas, [undefined, '3', '6']);
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').length, 9);
});

test('a lista falha na segunda página: nada é gravado, erro vai ao Registro e a nova tentativa funciona', () => {
  const c = consultorioComEventos(6);
  const todos = c.eventos.slice();
  let falha = true;
  c.amb.contexto.Calendar = { Events: {
    list: (cal, p) => { const i = p.pageToken ? Number(p.pageToken) : 0; if (i > 0 && falha) throw new Error('Quota: EXCECAO_FICTICIA_AGENDA_001'); return { items: todos.slice(i, i + 3), nextPageToken: i === 0 ? '3' : undefined }; },
    get: () => { throw new Error('Not Found'); },
  } };
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.equal(c.linhas('Consultas').length, 0, 'meia sincronização não pode gravar');
  assert.match(c.registroTexto(), /Falha no módulo sincronizacao/);
  assert.doesNotMatch(c.registroTexto(), /EXCECAO_FICTICIA/);
  falha = false;
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').length, 6);
});

test('mais de 40 consultas ausentes: confere só 40 por execução, NADA é cancelado sem confirmação e o resto vira aviso', () => {
  const c = consultorioComEventos(0);
  for (let i = 0; i < 45; i++) c.amb.abas.get('Consultas').linhas.push([`aus${i}`, '2026-10-10', '09:00', 'retorno', '', 'marcada', '', 'a']);
  const origem = c.rodar("marcaDaAgenda('primary')");
  c.amb.abas.get('Consultas').linhas.slice(1).forEach((l) => { l[7] = origem; });
  c.eventos.push({ id: 'unico', status: 'confirmed', summary: 'Consulta', description: '', start: { dateTime: '2026-10-12T09:00:00-03:00' }, end: { dateTime: '2026-10-12T10:00:00-03:00' } });
  let gets = 0;
  c.amb.contexto.Calendar = { Events: { list: () => ({ items: c.eventos }), get: () => { gets++; throw new Error('Not Found'); } } };
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.equal(gets, 40);
  assert.equal(c.linhas('Consultas').filter((l) => l[5] === 'cancelada').length, 0);
  assert.match(c.ultimoAlerta(), /45 consulta\(s\) marcada\(s\) não apareceram/);
});

test('a lista funciona e o Calendar.get falha: consulta ausente continua marcada, com aviso, sem erro', () => {
  const c = consultorioComEventos(1);
  c.amb.abas.get('Consultas').linhas.push(['sumiu', '2026-10-10', '09:00', 'retorno', '', 'marcada', '', c.rodar("marcaDaAgenda('primary')")]);
  c.amb.contexto.Calendar = { Events: { list: () => ({ items: c.eventos }), get: () => { throw new Error('Quota: EXCECAO_FICTICIA_GET_001'); } } };
  c.rodar('sincronizarAgendaPeloMenu()');
  assert.equal(c.linhas('Consultas').find((l) => l[0] === 'sumiu')[5], 'marcada');
  assert.match(c.ultimoAlerta(), /não foi possível confirmar/);
  assert.equal(c.amb.emails.length, 0);
});

test('o evento muda de lugar (linhas inseridas) enquanto a sincronização confere a agenda: nenhuma linha errada é gravada', () => {
  const c = consultorioComEventos(2);
  c.rodar('sincronizarAgenda()');
  const aba = c.amb.abas.get('Consultas');
  c.eventos[0] = { ...c.eventos[0], start: { dateTime: '2026-10-20T10:00:00-03:00' } }; // remarcado: exige gravar a linha dele
  let inserido = false;
  const lista = c.amb.contexto.Calendar.Events.list;
  c.amb.contexto.Calendar.Events.list = (...a) => { const r = lista(...a); if (!inserido) { inserido = true; aba.linhas.splice(1, 0, ['intruso', '2026-01-01', '08:00', 'primeira', '', 'marcada', '', 'x']); } return r; };
  c.rodar('sincronizarAgenda()');
  const intruso = aba.linhas.find((l) => l[0] === 'intruso');
  assert.deepEqual(intruso.slice(1, 4), ['2026-01-01', '08:00', 'primeira'], 'a linha inserida não pode receber dados de outra consulta');
  assert.equal(aba.linhas.filter((l) => l[0] === c.eventos[1].id).length, 1);
});

// ---------- identidade das linhas (item 28) ----------

function comUmaConsulta() {
  const c = consultorioComEventos(1);
  c.rodar('sincronizarAgenda()');
  return c;
}

// Aplica `mutacao` na planilha exatamente quando o kit vai conferir a identidade da linha (entre ler e gravar).
function mudarNoMeio(aba, mutacao) {
  const original = aba.getRange.bind(aba);
  let leituras = 0;
  aba.getRange = (l, col, nl, nc) => {
    // 1ª leitura de uma linha inteira = a leitura da aba; 2ª = a conferência de identidade logo antes de gravar
    if (l > 1 && nl === 1 && nc === aba.linhas[0].length && col === 1 && ++leituras === 2) mutacao();
    return original(l, col, nl, nc);
  };
  return () => { aba.getRange = original; };
}

for (const [nome, mutacao] of [
  ['linha movida (outra inserida antes)', (aba) => aba.linhas.splice(1, 0, ['outra', '2026-11-11', '11:00', 'primeira', '', 'marcada', '', 'x'])],
  ['linha apagada (a de baixo sobe)', (aba) => { aba.linhas.splice(1, 1); aba.linhas.splice(1, 0, ['subiu', '2026-11-11', '11:00', 'primeira', '', 'marcada', '', 'x']); }],
  ['id substituído', (aba) => { aba.linhas[1][0] = 'id-trocado'; }],
]) {
  test(`identidade: ${nome} entre ler e gravar => nada é gravado na linha errada`, () => {
    const c = comUmaConsulta();
    const aba = c.amb.abas.get('Consultas');
    c.selecionar('Consultas', 2);
    const restaurar = mudarNoMeio(aba, () => mutacao(aba));
    c.rodar('marcarConsultaRealizada()');
    restaurar();
    assert.ok(aba.linhas.slice(1).every((l) => l[5] === 'marcada'), 'ninguém foi marcado como realizado');
    assert.match(c.ultimoAlerta(), /mudou enquanto o kit trabalhava/);
  });
}

test('identidade: cabeçalho alterado, coluna acrescentada ou removida => nenhuma gravação', () => {
  const c = comUmaConsulta();
  const aba = c.amb.abas.get('Consultas');
  c.selecionar('Consultas', 2);
  aba.linhas[0][1] = 'dia';
  c.rodar('marcarConsultaRealizada()');
  assert.equal(aba.linhas[1][5], 'marcada');
  assert.match(c.ultimoAlerta(), /cabeçalho|Cabeçalho/);
  aba.linhas[0][1] = 'data';
  aba.linhas[0].push('coluna_nova');
  c.rodar('marcarConsultaRealizada()');
  assert.equal(aba.linhas[1][5], 'marcada');
  aba.linhas[0].pop();
  aba.linhas.forEach((l) => l.splice(2, 1)); // coluna "hora" removida
  c.rodar('marcarConsultaRealizada()');
  assert.ok(aba.linhas.every((l) => !l.includes('realizada')), 'nada foi gravado');
  assert.match(c.ultimoAlerta(), /cabeçalho|Cabeçalho/);
});

test('o link do recibo, o pagamento e o pacote são gravados só se a linha ainda é a mesma lida (conferência de identidade)', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda(); gerarAReceber()');
  const aba = c.amb.abas.get('Pagamentos');
  assert.throws(() => c.rodar("gravarCelula('Pagamentos', 2, 'status', 'pago', { id: 'PG999999' })"), /mudou enquanto o kit trabalhava/);
  assert.throws(() => c.rodar("gravarLinha('Pagamentos', 2, ['PG999999','e','P9001','','',1,'','a_receber','','',''])"), /mudou enquanto o kit trabalhava/);
  assert.equal(aba.linhas[1][7], 'a_receber');
});
