// Crescimento e chamadas externas (Gate, item 36). Sem metas de milissegundos: o que se confere é CONTAGEM, que não varia de máquina
// para máquina. (1) Quantas vezes a lógica pura toca em cada dado, por elemento: se cresce com n, há laço dentro de laço (n²).
// (2) Quantas chamadas à planilha, à Agenda e ao Drive cada operação faz: não pode crescer com o tamanho da base além do inevitável
// (a Agenda devolve 250 eventos por página). Os números medidos estão em docs/gate/DESEMPENHO.md (scripts/desempenho.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/Agenda.js');
const P = require('../src/Pagamentos.js');
const Rel = require('../src/Relatorio.js');
const Ac = require('../src/Acoes.js');
const { criarCenario, criarSorteio, cod } = require('./apoio/escala.js');

const cfg = { valor_primeira_consulta_centavos: 15000, valor_retorno_centavos: 10000, regra_retorno_dias: 30 };
const d2 = (n) => String(n).padStart(2, '0');
const dia = (i) => { const d = new Date(Date.UTC(2026, 0, 1 + (i % 365))); return `${d.getUTCFullYear()}-${d2(d.getUTCMonth() + 1)}-${d2(d.getUTCDate())}`; };

// Embrulha cada objeto num Proxy que conta as leituras de propriedade.
function contando(lista, contador) {
  return lista.map((o) => new Proxy(o, { get(alvo, k) { if (typeof k === 'string') contador.n++; return alvo[k]; } }));
}
// Leituras por elemento em dois tamanhos; o segundo não pode passar de `fator` vezes o primeiro (linear = 1; n² com n 5x maior = ~5).
function leiturasPorElemento(montar, tamanhos = [1000, 5000]) {
  return tamanhos.map((n) => { const c = { n: 0 }; montar(n, c); return c.n / n; });
}
function naoCrescemComN(montar, nome, fator = 2) {
  const [pequeno, grande] = leiturasPorElemento(montar);
  assert.ok(grande <= pequeno * fator, `${nome}: ${pequeno.toFixed(1)} leituras por elemento com 1.000 e ${grande.toFixed(1)} com 5.000 (laço dentro de laço?)`);
}

const consultas = (n, { pacientes = 100, tipo = () => 'primeira' } = {}) => Array.from({ length: n }, (_, i) => ({
  linha: i + 2, id_evento: `ev${i}`, data: dia(i), hora: `${d2(8 + (i % 10))}:00`, tipo: tipo(i), codigo_paciente: cod(i % pacientes), status: 'marcada', atualizado_em: '',
}));
const pagamentos = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({
  linha: i + 2, id: `PG${String(i + 1).padStart(6, '0')}`, id_evento: `ev${i}`, codigo_paciente: cod(i % 100), pagador_nome: `Pagador ${i % 200}`, pagador_cpf: '52998224725',
  valor_centavos: 15000, forma: 'pix', status: 'pago', data_pagamento: `2026-09-${d2(1 + (i % 28))}`, link_recibo: '', pacote_inicio: '', ...extra(i),
}));

test('a receber: leituras por consulta não crescem com n, nem no pior caso (todas "primeira", cada uma de um paciente diferente)', () => {
  naoCrescemComN((n, c) => P.planejarAReceber({ consultas: contando(consultas(n, { pacientes: n }), c), pagamentos: [], config: cfg }), 'todas primeira, pacientes distintos');
  naoCrescemComN((n, c) => P.planejarAReceber({ consultas: contando(consultas(n, { pacientes: 100, tipo: (i) => (i % 5 === 0 ? 'primeira' : 'retorno') }), c), pagamentos: [], config: cfg }), 'misto');
  naoCrescemComN((n, c) => P.planejarAReceber({ consultas: consultas(n), pagamentos: contando(pagamentos(n), c), config: cfg }), 'reexecução (pagamentos lidos)');
  // muitas consultas canceladas, cada uma com cobrança aberta: antes, uma busca em todos os pagamentos para cada cancelada
  naoCrescemComN((n, c) => P.planejarAReceber({
    consultas: consultas(n).map((x) => ({ ...x, status: 'cancelada' })),
    pagamentos: contando(pagamentos(n, () => ({ status: 'a_receber', forma: '', valor_centavos: 15000, data_pagamento: '' })), c), config: cfg,
  }), 'canceladas com cobrança aberta');
});

test('relatório do mês: leituras por pagamento não crescem com n', () => {
  naoCrescemComN((n, c) => Rel.consolidarRecebimentos(contando(pagamentos(n), c), '2026-09'), 'relatório');
});

test('pacotes: reconciliar não cruza pacotes x pagamentos (leituras por pacote não crescem com n)', () => {
  const pacotes = (n) => Array.from({ length: Math.ceil(n / 10) }, (_, i) => ({ linha: i + 2, codigo_paciente: cod(i), total_consultas: 10, usadas: 0, valor_centavos: 100000, inicio: '2026-01-01' }));
  naoCrescemComN((n, c) => Ac.reconciliarPacotes(contando(pacotes(n), c), pagamentos(n, (i) => ({ forma: 'pacote', pacote_inicio: '2026-01-01', codigo_paciente: cod(i % Math.ceil(n / 10)) }))), 'reconciliar pacotes');
});

test('agenda: cada paciente é lido uma vez por sincronização, não uma vez por evento', () => {
  const janela = A.calcularJanelaAgenda({ ano: 2026, mes: 9, dia: 30 });
  const montar = (eventosN, pacientesN) => {
    const leituras = { n: 0 };
    const pacientes = Array.from({ length: pacientesN }, (_, i) => ({
      codigo: cod(i), ativo: true,
      get email() { leituras.n++; return `p${i}@exemplo.invalid`; },
      get telefone() { leituras.n++; return `5511${String(900000000 + i)}`; },
    }));
    const eventos = Array.from({ length: eventosN }, (_, i) => ({
      id: `ev${i}`, status: 'confirmed', summary: 'Consulta', start: { dateTime: `2026-10-${d2(1 + (i % 28))}T${d2(8 + (i % 10))}:00:00-03:00` }, attendees: [{ email: `p${i % pacientesN}@exemplo.invalid` }],
    }));
    const plano = A.planejarSincronizacaoAgenda({ eventos, existentes: [], pacientes, prefixo: 'Consulta', janela, agoraTexto: '2026-09-30 12:00:00', origemAtual: 'a1' });
    assert.equal(plano.inserir.length, eventosN);
    assert.equal(plano.aIdentificar.length, 0);
    return leituras.n;
  };
  assert.equal(montar(500, 200), 2 * 200); // e-mail e telefone de cada paciente, uma vez
  assert.equal(montar(3000, 200), 2 * 200); // mais eventos, mesma leitura
  assert.equal(montar(500, 800), 2 * 800); // mais pacientes: cresce só com eles
});

// ---------- Equivalência: o índice dá exatamente o mesmo resultado que a busca direta (a especificação) ----------

function identificarPorBusca(evento, pacientes) { // a regra, escrita da forma mais direta possível
  const { emails, telefones } = A.contatosDoEvento(evento);
  const achados = new Set();
  for (const p of pacientes) {
    if (p.ativo === false) continue;
    const email = String(p.email || '').trim().toLowerCase();
    const tel = A.normalizarTelefoneAgenda(p.telefone);
    if ((email && emails.has(email)) || (tel.length >= 10 && telefones.has(tel))) achados.add(String(p.codigo));
  }
  return achados.size === 1 ? [...achados][0] : null;
}

test('identificar paciente pelo índice = busca direta, com e-mails repetidos, telefones iguais, inativos, maiúsculas e formatos de telefone', () => {
  const sorteio = criarSorteio(7);
  const formas = [(n) => n, (n) => `+55 (11) ${String(n).slice(0, 5)}-${String(n).slice(5)}`, (n) => `55${n}`, (n) => ` ${n} `];
  const pacientes = Array.from({ length: 60 }, (_, i) => {
    const igual = sorteio(6) === 0 && i > 0; // dois pacientes com os mesmos contatos (ambíguo)
    const base = igual ? i - 1 : i;
    return { codigo: cod(i), ativo: sorteio(8) !== 0, email: sorteio(5) === 0 ? '' : `Pessoa${base}@Exemplo.invalid`, telefone: sorteio(4) === 0 ? '123' : `11${String(900000000 + base)}` };
  });
  let identificados = 0; let ambiguos = 0; let nenhum = 0;
  for (let k = 0; k < 400; k++) {
    const alvo = pacientes[sorteio(pacientes.length)];
    const evento = { attendees: [], description: '' };
    if (sorteio(2)) evento.attendees.push({ email: ` ${String(alvo.email).toUpperCase()} ` });
    if (sorteio(2)) evento.description = `Contato ${formas[sorteio(formas.length)](String(alvo.telefone).replace(/\D/g, ''))}`;
    if (sorteio(5) === 0) evento.attendees.push({ email: `desconhecido${sorteio(9)}@exemplo.invalid` });
    const esperado = identificarPorBusca(evento, pacientes);
    assert.equal(A.identificarPacienteAgenda(evento, pacientes), esperado);
    assert.equal(A.identificarPacienteAgenda(evento, pacientes, A.indexarPacientesAgenda(pacientes)), esperado);
    if (esperado) identificados++; else if (A.contatosDoEvento(evento).emails.size + A.contatosDoEvento(evento).telefones.size > 0) ambiguos++; else nenhum++;
  }
  assert.ok(identificados > 30, `poucos casos identificados (${identificados}): o teste não está exercitando o caso feliz`);
  assert.ok(ambiguos + nenhum > 30, 'poucos casos sem identificação');
});

// ---------- Equivalência: as contagens indexadas = definição por varredura ----------

test('consumidas por pacote = contagem direta por (paciente, início), com início repetido, vazio, pagamento de outro tipo e sem pacote_inicio', () => {
  const sorteio = criarSorteio(11);
  const inicios = ['2026-01-01', '2026-03-01', '', '2026-06-15'];
  const pacotes = Array.from({ length: 40 }, (_, i) => ({ linha: i + 2, codigo_paciente: cod(sorteio(15)), total_consultas: 10, usadas: sorteio(5), valor_centavos: 100000, inicio: inicios[sorteio(inicios.length)] }));
  const pags = pagamentos(300, () => ({
    codigo_paciente: cod(sorteio(15)), forma: ['pacote', 'pix', 'pacote'][sorteio(3)], status: ['pago', 'pago', 'a_receber'][sorteio(3)], pacote_inicio: inicios[sorteio(inicios.length)],
  }));
  const direto = pacotes.map((p) => {
    const codigo = String(p.codigo_paciente); const inicio = String(p.inicio || '');
    if (inicio === '' || pacotes.filter((x) => String(x.codigo_paciente) === codigo && String(x.inicio || '') === inicio).length > 1) return 0;
    return pags.filter((g) => String(g.codigo_paciente) === codigo && g.status === 'pago' && g.forma === 'pacote' && String(g.pacote_inicio || '') === inicio).length;
  });
  assert.deepEqual(Ac.consumidasPorPacote(pacotes, pags), direto);
  assert.ok(direto.some((x) => x > 0) && direto.some((x) => x === 0), 'o cenário precisa ter pacotes com e sem consumo');
  assert.ok(pacotes.some((p, i) => pacotes.filter((x) => x.codigo_paciente === p.codigo_paciente && x.inicio === p.inicio).length > 1), 'o cenário precisa ter pacote duplicado');
});

test('a receber: primeira com histórico e cancelada com cobrança aberta batem com a definição por varredura', () => {
  const sorteio = criarSorteio(13);
  const status = ['marcada', 'marcada', 'realizada', 'cancelada', 'faltou'];
  const lista = Array.from({ length: 400 }, (_, i) => ({
    linha: i + 2, id_evento: `ev${i}`, data: dia(sorteio(120)), hora: `${d2(8 + sorteio(10))}:00`, tipo: ['primeira', 'retorno'][sorteio(2)],
    codigo_paciente: sorteio(12) === 0 ? '' : cod(sorteio(90)), status: status[sorteio(status.length)], atualizado_em: '',
  }));
  const pags = Array.from({ length: 60 }, (_, i) => ({ id: `PG${String(i + 1).padStart(6, '0')}`, id_evento: `ev${sorteio(400)}`, status: ['a_receber', 'pago'][sorteio(2)], codigo_paciente: 'P0001' }));
  const plano = P.planejarAReceber({ consultas: lista, pagamentos: pags, config: cfg });
  // definição direta
  const comPagamento = new Set(pags.map((p) => String(p.id_evento)));
  const vistos = new Set(); let comHistorico = 0; let canceladasAbertas = 0;
  for (const c of lista.slice().sort((a, b) => (`${a.data}${a.hora}`).localeCompare(`${b.data}${b.hora}`))) {
    const id = String(c.id_evento);
    if (vistos.has(id)) continue; vistos.add(id);
    if (c.status === 'cancelada') { if (pags.some((p) => String(p.id_evento) === id && p.status === 'a_receber')) canceladasAbertas++; continue; }
    if (!['marcada', 'realizada'].includes(c.status) || comPagamento.has(id) || !c.codigo_paciente) continue;
    if (c.tipo === 'primeira' && lista.some((o) => o !== c && String(o.codigo_paciente) === String(c.codigo_paciente) && o.status !== 'cancelada' && `${o.data}${o.hora}` < `${c.data}${c.hora}`)) comHistorico++;
  }
  assert.equal(plano.contagens.primeiraComHistorico, comHistorico);
  assert.equal(plano.contagens.canceladasComCobranca, canceladasAbertas);
  assert.ok(comHistorico > 10 && canceladasAbertas > 3, `cenário fraco (${comHistorico}, ${canceladasAbertas})`);
});

// ---------- Faixas de linhas vizinhas ----------

test('agruparEmFaixas: junta só linhas consecutivas do mesmo tamanho e não toca em nenhuma outra', () => {
  const item = (linha, ...v) => ({ linha, valores: v.length ? v : [linha] });
  assert.deepEqual(A.agruparEmFaixas([]), []);
  assert.deepEqual(A.agruparEmFaixas([item(5)]), [{ linha: 5, valores: [[5]] }]);
  assert.deepEqual(A.agruparEmFaixas([item(7), item(5), item(6)]), [{ linha: 5, valores: [[5], [6], [7]] }]); // fora de ordem
  assert.deepEqual(A.agruparEmFaixas([item(2), item(3), item(5), item(9), item(10)]).map((f) => [f.linha, f.valores.length]), [[2, 2], [5, 1], [9, 2]]);
  // tamanhos diferentes não se misturam (setValues exige faixa retangular)
  assert.deepEqual(A.agruparEmFaixas([item(2, 'a', 'b'), item(3, 'c')]).map((f) => [f.linha, f.valores.length]), [[2, 1], [3, 1]]);
  // mesma linha duas vezes: nunca vira uma faixa com linha repetida
  assert.deepEqual(A.agruparEmFaixas([item(4), item(4)]).map((f) => f.linha), [4, 4]);
  // não altera a entrada
  const entrada = [item(3), item(2)];
  A.agruparEmFaixas(entrada);
  assert.deepEqual(entrada.map((i) => i.linha), [3, 2]);
});

test('agruparEmFaixas (propriedade): toda linha entra em exatamente uma faixa, na posição certa, e a quantidade de faixas é a de lacunas + 1', () => {
  const sorteio = criarSorteio(17);
  for (let rodada = 0; rodada < 100; rodada++) {
    const linhas = [...new Set(Array.from({ length: sorteio(60) }, () => 2 + sorteio(80)))];
    const faixas = A.agruparEmFaixas(linhas.map((l) => ({ linha: l, valores: [l] })));
    const reconstruidas = faixas.flatMap((f) => f.valores.map((v, i) => [f.linha + i, v[0]]));
    assert.deepEqual(reconstruidas.sort((a, b) => a[0] - b[0]), [...linhas].sort((a, b) => a - b).map((l) => [l, l]));
    const ordenadas = [...linhas].sort((a, b) => a - b);
    const lacunas = ordenadas.filter((l, i) => i > 0 && l !== ordenadas[i - 1] + 1).length;
    assert.equal(faixas.length, linhas.length === 0 ? 0 : lacunas + 1);
  }
});

// ---------- Chamadas externas por operação (Google simulado, contagem por chamada) ----------

const TAMANHOS = [100, 1000, 5000];
const em = (nome, montar, executar) => TAMANHOS.map((n) => { const c = montar(n); c.zerar(); executar(c, n); return { n, ...c.contador, drive: c.chamadasDrive(), nome }; });

test('sincronizar (base estável): leituras e escritas da planilha não crescem com a base; a Agenda cresce só em páginas de 250', () => {
  const r = em('sinc', (n) => criarCenario({ pacientes: 100, consultas: n }), (c) => c.rodar('sincronizarAgenda()'));
  for (const x of r) {
    assert.equal(x.leituras, r[0].leituras, `leituras com ${x.n}`);
    assert.ok(x.escritas <= 1, `escritas com ${x.n}: ${x.escritas} (só o Registro)`);
    assert.equal(x.agendaLista, Math.ceil(x.n / 250));
    assert.equal(x.agendaGet, 0);
    assert.equal(x.drive, 0);
  }
});

test('sincronizar (primeira vez depois da atualização, todas as linhas sem marca de agenda): uma escrita para todas as marcas, não uma por linha', () => {
  const r = em('legado', (n) => criarCenario({ pacientes: 100, consultas: n, semMarca: true }), (c) => c.rodar('sincronizarAgenda()'));
  for (const x of r) assert.ok(x.escritas <= 2, `escritas com ${x.n} linhas sem marca: ${x.escritas} (antes: ${x.n + 1})`);
});

test('sincronizar (muitas consultas novas): uma escrita para todas, não uma por consulta', () => {
  const r = em('novas', (n) => criarCenario({ pacientes: 100, consultas: 0, eventosNovos: n }), (c) => c.rodar('sincronizarAgenda()'));
  for (const x of r) assert.ok(x.escritas <= 2, `escritas com ${x.n} consultas novas: ${x.escritas}`);
});

test('sincronizar (linhas remarcadas vizinhas): uma escrita por faixa, nunca uma por linha dentro da faixa', () => {
  const c = criarCenario({ pacientes: 100, consultas: 1000 });
  // as 300 primeiras consultas da planilha mudam de horário na agenda: 300 linhas consecutivas
  c.eventosEscala = c.eventosEscala.map((e, i) => (i < 300 ? { ...e, start: { dateTime: e.start.dateTime.replace(/T\d\d:/, 'T18:') }, end: { dateTime: e.end.dateTime.replace(/T\d\d:/, 'T18:') } } : e));
  c.zerar();
  const plano = c.rodar('sincronizarAgenda()');
  assert.equal(plano.atualizar.length, 300);
  assert.ok(c.contador.escritas <= 2, `escritas: ${c.contador.escritas} (300 linhas vizinhas)`);
});

test('gerar a receber e relatório do mês: chamadas à planilha e ao Drive constantes, qualquer que seja o tamanho da base', () => {
  const a = em('areceber', (n) => criarCenario({ pacientes: 100, consultas: n, pagamentos: 0 }), (c) => c.rodar('gerarAReceber()'));
  for (const x of a) { assert.equal(x.leituras, a[0].leituras); assert.ok(x.escritas <= 2); assert.equal(x.drive, 0); assert.equal(x.agendaLista, 0); }
  const r = em('relatorio', (n) => criarCenario({ pacientes: 100, consultas: 10, pagamentos: n }), (c) => c.rodar("gerarRelatorioMensal('2026-09')"));
  for (const x of r) { assert.equal(x.leituras, r[0].leituras); assert.ok(x.escritas <= 2); assert.equal(x.drive, r[0].drive); }
});

test('recibo e pagamento de uma linha: chamadas ao Drive e à planilha constantes, qualquer que seja o tamanho de Pagamentos', () => {
  const recibo = em('recibo', (n) => {
    const c = criarCenario({ pacientes: 100, consultas: n, pagamentos: n });
    c.definir('Pagamentos', 3, 'pagador_nome', 'Maria Souza Teste');
    c.definir('Pagamentos', 3, 'pagador_cpf', '52998224725');
    return c;
  }, (c) => assert.ok(c.rodar('gerarRecibo(3)').link));
  for (const x of recibo) { assert.equal(x.leituras, recibo[0].leituras); assert.equal(x.escritas, recibo[0].escritas); assert.equal(x.drive, 4, 'listar, copiar, criar o PDF, mandar a cópia para a lixeira'); }
  const pago = em('pago', (n) => { const c = criarCenario({ pacientes: 100, consultas: n, pagamentos: n }); c.selecionar('Pagamentos', 2); return c; }, (c) => c.rodar('marcarPagoPix()'));
  for (const x of pago) { assert.equal(x.leituras, pago[0].leituras); assert.equal(x.escritas, pago[0].escritas); assert.equal(x.drive, 0); }
});

test('scripts/desempenho.js gera as duas tabelas, sem valores faltando', () => {
  const texto = require('../scripts/desempenho.js').relatorio();
  assert.match(texto, /### Lógica local/);
  assert.match(texto, /### Chamadas externas por operação/);
  assert.doesNotMatch(texto, /NaN|undefined|Infinity/);
  assert.ok(texto.split('\n').filter((l) => /^\| (sincronizar|gerar|marcar|relatório)/.test(l)).length >= 24);
});
