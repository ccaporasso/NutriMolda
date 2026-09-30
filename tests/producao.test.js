// R4: o pacote de PRODUÇÃO não leva o gerador de dados fictícios nem a permissão exclusiva de teste.
// O teste monta o pacote em memória a partir de src/ e o confere; se alguém acrescentar uma dependência
// do gerador em outro arquivo, ou trocar um escopo, este teste falha antes de qualquer envio ao Google.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../scripts/empacotar-producao.js');
const { criarAmbiente } = require('./apoio/simulacao.js');

const raiz = path.join(__dirname, '..');
const pacote = E.montarPacoteProducao();
const manifestoTeste = JSON.parse(fs.readFileSync(path.join(raiz, 'src', 'appsscript.json'), 'utf8'));
const nomesDe = (itens) => itens.flatMap((i) => (i[0] === '>' ? [i[1], ...nomesDe(i[2])] : [i[1]])).filter(Boolean);

test('o pacote de produção não tem os arquivos do gerador de dados fictícios', () => {
  const nomes = pacote.arquivos.map((a) => a.nome);
  for (const proibido of ['DadosTeste.js', 'GeradorTeste.js']) assert.ok(!nomes.includes(proibido), `${proibido} está no pacote`);
  assert.deepEqual(pacote.excluidos.sort(), ['DadosTeste.js', 'GeradorTeste.js']);
  assert.ok(nomes.length >= 15, 'o pacote perdeu arquivos demais');
});

test('nada do pacote menciona o gerador, os pacientes P9xxx, e-mails inventados ou escrita na agenda', () => {
  assert.deepEqual(E.verificarPacoteProducao(pacote), []);
  const texto = pacote.arquivos.map((a) => a.conteudo).join('\n');
  for (const nome of ['criarDadosDeTeste', 'apagarDadosDeTeste', 'PACIENTES_TESTE', 'EVENTOS_TESTE', 'MARCA_TESTE', 'montarEventosTeste', 'validarAgendaDeTeste']) {
    assert.doesNotMatch(texto, new RegExp(`\\b${nome}\\b`), nome);
  }
  assert.doesNotMatch(texto, /Calendar\.Events\.(insert|update|patch|remove|delete)/);
});

test('os nomes que o gerador define são descobertos sozinhos (a conferência não depende de lista escrita à mão)', () => {
  for (const n of ['MARCA_TESTE', 'PACIENTES_TESTE', 'criarDadosDeTeste', 'apagarDadosDeTeste', 'adicionarMenuDeTeste_', 'planejarLimpezaDeTeste']) {
    assert.ok(pacote.nomesExcluidos.includes(n), `${n} não foi reconhecido como nome de teste`);
  }
});

test('produção só lê a agenda: sai calendar.events (escrita) e entra calendar.events.readonly', () => {
  const testeEscopos = manifestoTeste.oauthScopes;
  const prodEscopos = pacote.manifesto.oauthScopes;
  assert.ok(testeEscopos.includes(E.ESCOPO_AGENDA_TESTE), 'o pacote de teste precisa poder escrever na agenda');
  assert.ok(!prodEscopos.includes(E.ESCOPO_AGENDA_TESTE));
  assert.ok(prodEscopos.includes(E.ESCOPO_AGENDA_PRODUCAO));
  // a única diferença entre teste e produção é essa troca
  assert.deepEqual(prodEscopos.filter((e) => !testeEscopos.includes(e)), [E.ESCOPO_AGENDA_PRODUCAO]);
  assert.deepEqual(testeEscopos.filter((e) => !prodEscopos.includes(e)), [E.ESCOPO_AGENDA_TESTE]);
});

test('a lista de escopos de produção é exata e cada um está justificado em DECISOES.md', () => {
  assert.deepEqual([...pacote.manifesto.oauthScopes].sort(), [...E.ESCOPOS_DE_PRODUCAO].sort());
  const decisoes = fs.readFileSync(path.join(raiz, 'docs', 'DECISOES.md'), 'utf8');
  for (const escopo of pacote.manifesto.oauthScopes) {
    const nome = escopo.split('/').pop().replace(/\./g, '\\.');
    assert.match(decisoes, new RegExp(`^\\| \`${nome}\` \\|`, 'm'), `escopo de produção sem linha na tabela: ${escopo}`);
  }
  assert.match(decisoes, /^\| D23 \|/m);
});

test('o manifesto de produção mantém fuso, motor V8 e o serviço avançado de agenda (leitura)', () => {
  assert.equal(pacote.manifesto.timeZone, 'America/Sao_Paulo');
  assert.equal(pacote.manifesto.runtimeVersion, 'V8');
  assert.deepEqual(pacote.manifesto.dependencies, manifestoTeste.dependencies);
  assert.equal(pacote.manifesto.webapp, undefined);
});

test('o pacote de produção carrega inteiro, o menu monta sem o submenu de teste e todo item aponta para função existente', () => {
  const amb = criarAmbiente({});
  for (const a of pacote.arquivos) amb.carregarTexto(a.nome, a.conteudo);
  amb.contexto.SpreadsheetApp.getUi = () => amb.ui;
  amb.rodar('onOpen()');
  const itens = nomesDe(amb.menu.itens);
  assert.ok(itens.length >= 15);
  assert.ok(!itens.some((t) => /TESTE/i.test(t)), `o menu de produção mostra item de teste: ${itens.filter((t) => /TESTE/i.test(t))}`);
  const funcoes = amb.menu.itens.flatMap(function achar(i) { return i[0] === '>' ? i[2].flatMap(achar) : (i[0] === '---' ? [] : [i[1]]); });
  assert.ok(funcoes.length >= 15);
  // no simulador, addItem guarda [texto, função]; confere que cada função existe no pacote
  const pares = [];
  (function coletar(lista) { for (const i of lista) { if (i[0] === '>') coletar(i[2]); else if (i[0] !== '---') pares.push(i); } }(amb.menu.itens));
  for (const [texto, funcao] of pares) assert.equal(amb.rodar(`typeof ${funcao}`), 'function', `${texto} -> ${funcao} não existe no pacote`);
});

test('o pacote de teste (src/) continua com o gerador e o submenu de teste', () => {
  const amb = criarAmbiente({});
  amb.carregar(...fs.readdirSync(path.join(raiz, 'src')).filter((a) => a.endsWith('.js')));
  amb.contexto.SpreadsheetApp.getUi = () => amb.ui;
  amb.rodar('onOpen()');
  const itens = nomesDe(amb.menu.itens); // o simulador guarda o nome da função de cada item
  assert.ok(itens.includes('criarDadosDeTeste'));
  assert.ok(itens.includes('apagarDadosDeTeste'));
});

test('a conferência pega o erro: gerador escondido em outro arquivo, escopo de escrita e arquivo de teste são recusados', () => {
  const sujo = {
    ...pacote,
    arquivos: pacote.arquivos.concat([
      { nome: 'Extra.js', conteudo: "function x() { return criarDadosDeTeste(); }\nCalendar.Events.insert({}, 'a@group.calendar.google.com');\nconst p = 'P9001';" },
      { nome: 'GeradorTeste.js', conteudo: '' },
    ]),
    manifesto: { ...pacote.manifesto, oauthScopes: pacote.manifesto.oauthScopes.concat([E.ESCOPO_AGENDA_TESTE, 'https://www.googleapis.com/auth/drive']) },
  };
  const problemas = E.verificarPacoteProducao(sujo).join('\n');
  assert.match(problemas, /leva o arquivo de teste GeradorTeste\.js/);
  assert.match(problemas, /Extra\.js usa "criarDadosDeTeste"/);
  assert.match(problemas, /Extra\.js tem marca de teste/);
  assert.match(problemas, /permissão para escrever na agenda/);
  assert.match(problemas, /Escopo fora da lista de produção: https:\/\/www\.googleapis\.com\/auth\/drive$/m);
});

test('escreverPacote grava só em dist/, com os mesmos arquivos e o manifesto de produção; recusa outra pasta', () => {
  assert.throws(() => E.escreverPacote(pacote, os.tmpdir()), /dentro de dist/);
  const destino = path.join(raiz, 'dist', 'producao-teste-automatico');
  try {
    E.escreverPacote(pacote, destino);
    const gravados = fs.readdirSync(destino).sort();
    assert.ok(gravados.includes('appsscript.json'));
    assert.ok(!gravados.includes('GeradorTeste.js') && !gravados.includes('DadosTeste.js'));
    assert.equal(gravados.length, pacote.arquivos.length + 1);
    const m = JSON.parse(fs.readFileSync(path.join(destino, 'appsscript.json'), 'utf8'));
    assert.deepEqual(m.oauthScopes, pacote.manifesto.oauthScopes);
  } finally {
    fs.rmSync(destino, { recursive: true, force: true });
  }
});
