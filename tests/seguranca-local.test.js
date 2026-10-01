// Gate D: segurança local. (a) injeção de fórmula em todos os caminhos que levam texto à planilha ou ao CSV; (b) varredura de segredos,
// PII e configuração com controles positivos (o detector TEM de achar o que deve achar); (c) experimento do registro de exceções
// (Stackdriver) com texto fictício de nome, CPF e condição de saúde. Só dados inventados. Google simulado (E2).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../src/Formatos.js');
const Rg = require('../src/Registro.js');
const Rl = require('../src/Relatorio.js');
const Rs = require('../src/Respostas.js');
const S = require('../scripts/seguranca.js');
const { montarPacoteProducao } = require('../scripts/empacotar-producao.js');
const { criarConsultorio, textoQuePodeVazar } = require('./apoio/fluxo.js');

const raiz = path.join(__dirname, '..');

// ---------- (a) injeção de fórmula ----------
// Um valor é "perigoso" se o PRIMEIRO caractere for um sinal de fórmula, tabulação ou retorno de carro. O valor neutralizado começa com espaço.
const comecaComoFormula = (t) => /^[=+\-@\t\r]/.test(String(t));

const PERIGOSOS = ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '=HYPERLINK("http://x.invalid","clique")', '\t=1+1', '\r=1+1', '\n=1+1', ' =1+1', ' =1+1', '​=1+1', '﻿@x', '\tabc', '\rabc'];
const INOFENSIVOS = ['Maria Teste', '', '1+1', 'a=b', 'João - Silva', '＝1+1', '(=1)', '€ 10', '́=x'];

test('neutralizarFormula: tudo que um leitor de planilha poderia executar ganha espaço na frente; o resto fica intacto', () => {
  for (const t of PERIGOSOS) assert.equal(F.neutralizarFormula(t), ` ${t}`, JSON.stringify(t));
  for (const t of INOFENSIVOS) assert.equal(F.neutralizarFormula(t), t, JSON.stringify(t));
  assert.equal(F.neutralizarFormula(undefined), '');
  assert.equal(F.neutralizarFormula(null), '');
  assert.equal(F.neutralizarFormula(5), '5');
});

test('Registro: mensagem com fórmula, tabulação ou quebra de linha nunca começa como fórmula', () => {
  for (const t of PERIGOSOS) {
    const msg = Rg.montarLinhaRegistro('2026-09-30 10:00:00', 'recibo', 'info', t)[3];
    assert.equal(comecaComoFormula(msg), false, JSON.stringify(t));
      }
});

test('Respostas (T20-24): nota com fórmula é neutralizada pela mesma função central', () => {
  for (const t of PERIGOSOS) {
    const r = Rs.validarResposta({ dataHora: '2026-09-30 10:00:00', codigo: 'P9001', resposta: Rs.OPCOES_RESPOSTA[0], nota: t }, ['P9001']);
    assert.equal(r.ok, true);
    assert.equal(comecaComoFormula(r.linha[3]), false, JSON.stringify(t));
  }
});

function relatorioComPagador(nome) {
  const pagamentos = [{ id: 'PG1', status: 'pago', forma: 'pix', valor_centavos: 15000, pagador_nome: nome, pagador_cpf: '', data_pagamento: '2026-09-10' }];
  return Rl.consolidarRecebimentos(pagamentos, '2026-09');
}

test('Relatório: nome do pagador perigoso é neutralizado na aba E no CSV (com aspas, ponto e vírgula e quebra de linha)', () => {
  for (const nome of PERIGOSOS.concat(['=cmd|" /C calc"!A0', '@A1;=2+2', '=1+1\n=2+2'])) {
    const r = relatorioComPagador(nome);
    const aba = Rl.linhasAbaRelatorio(r).find((l) => l[2] === 1);
    assert.equal(comecaComoFormula(String(aba[0])), false, `aba: ${JSON.stringify(nome)}`);
    const csv = Rl.montarCsvRelatorio(r);
    const corpo = csv.replace(/^﻿/, '').split('\r\n');
    assert.equal(corpo[0], 'pagador;cpf;quantidade;total_reais');
    // o campo do nome (primeiro do registro, possivelmente entre aspas) não pode começar com sinal de fórmula
    const campo = /^"((?:[^"]|"")*)"|^([^;"]*)/.exec(csv.replace(/^﻿/, '').slice(corpo[0].length + 2));
    const valor = (campo[1] !== undefined ? campo[1].replace(/""/g, '"') : campo[2]);
    assert.equal(comecaComoFormula(valor), false, `csv: ${JSON.stringify(nome)}`);
  }
});

test('CSV: acentos, Unicode e emoji passam inteiros; o arquivo começa com a marca UTF-8 e usa CRLF', () => {
  const r = relatorioComPagador('Ângela Müller 😀');
  const csv = Rl.montarCsvRelatorio(r);
  assert.ok(csv.startsWith('﻿pagador;'));
  assert.match(csv, /Ângela Müller 😀;;1;150,00\r\n/);
  assert.ok(csv.endsWith('\r\n'));
});

test('Planilha: texto digitado pela usuária que o kit regrava (pagador_nome) nunca é escrito como fórmula', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda(); gerarAReceber()');
  c.definir('Pagamentos', 2, 'pagador_nome', '=HYPERLINK("http://x.invalid","a")');
  c.selecionar('Pagamentos', 2);
  c.rodar('marcarPagoPix()');
  assert.equal(c.celula('Pagamentos', 2, 'pagador_nome'), ' =HYPERLINK("http://x.invalid","a")');
  c.definir('Pagamentos', 3, 'pagador_nome', '+55 11 91234-5678');
  c.selecionar('Pagamentos', 3);
  c.rodar('marcarPagoDinheiro()');
  assert.match(c.celula('Pagamentos', 3, 'pagador_nome'), /^ \+55/);
});

// ---------- (b) o detector acha o que deve achar (controles positivos) ----------

const junta = (...p) => p.join('');
test('varredura de segredos acha cada tipo de segredo (padrões montados em pedaços: este arquivo não vira achado)', () => {
  const amostras = [
    junta('-----BEGIN ', 'RSA PRIVATE KEY-----'), junta('AK', 'IA', 'ABCDEFGHIJKLMNOP'), junta('AI', 'za', 'A'.repeat(35)), junta('GOC', 'SPX-', 'a'.repeat(28)),
    junta('ya', '29.', 'a'.repeat(40)), junta('gh', 'p_', 'a'.repeat(36)), junta('xo', 'xb-', '1234567890-abcdef'),
    junta('ey', 'J', 'a'.repeat(12), '.ey', 'J', 'b'.repeat(12), '.', 'c'.repeat(12)), junta('const api', '_key = "abcdefghijklmnop";'), junta('sen', 'ha: "umaSenhaLonga123"'),
    junta('https://usuario', ':segredo@exemplo.invalid/x'), junta('1', 'A'.repeat(43)), junta('1', 'B'.repeat(32)),
  ];
  for (const a of amostras) assert.ok(S.varrerSegredos(`x = ${a}`, 'f.js').length >= 1, `não achou: ${a.slice(0, 12)}...`);
  for (const ok of ['id_pasta_recibos', 'pasta123', 'const token = tokenDoUsuario;', '123e4567-e89b-12d3-a456-426614174000', 'abcdef']) {
    assert.equal(S.varrerSegredos(ok, 'f.js').length, 0, ok);
  }
});

test('varredura de PII acha e-mail real, CPF e telefone desconhecidos; aceita os fictícios e os domínios reservados', () => {
  const real = junta('maria', '@', 'provedor', '.com.br');
  assert.equal(S.varrerPII(real, 'f').length, 1);
  assert.equal(S.varrerPII(junta('cpf 9876', '5432100'), 'f').length, 1);
  assert.equal(S.varrerPII(junta('cpf 987.654', '.321-00'), 'f').length, 1);
  assert.equal(S.varrerPII(junta('ana@exemplo.invalid x@exam', 'ple.org y@teste', '.test 52998224725'), 'f').length, 0);
  assert.equal(S.varrerPII('número 1234567890123', 'f').length, 0, 'mais de 11 dígitos não é CPF');
  for (const a of S.varrerPII(real, 'f')) assert.doesNotMatch(JSON.stringify(a), /maria/, 'o achado nunca repete o valor');
});

test('o repositório inteiro (HEAD) passa na varredura de PII, segredos e configuração', () => {
  const r = S.executar([]);
  assert.equal(r.ruim, false, r.texto);
});

// ---------- (c) configuração e serviços do Google (item 23) ----------

const manifestoBase = () => JSON.parse(fs.readFileSync(path.join(raiz, 'src', 'appsscript.json'), 'utf8'));
const srcBase = () => Object.fromEntries(fs.readdirSync(path.join(raiz, 'src')).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(raiz, 'src', f), 'utf8')]));

test('escopo novo, serviço avançado novo, web app e biblioteca fazem o gate de configuração falhar', () => {
  assert.equal(S.verificarConfiguracao(manifestoBase(), srcBase()).length, 0);
  const novoEscopo = manifestoBase(); novoEscopo.oauthScopes.push('https://www.googleapis.com/auth/drive');
  assert.match(S.verificarConfiguracao(novoEscopo, srcBase()).map((a) => a.tipo).join(), /escopo não previsto: drive/);
  const amplo = manifestoBase(); amplo.oauthScopes.push('https://www.googleapis.com/auth/calendar');
  assert.ok(S.verificarConfiguracao(amplo, srcBase()).length > 0);
  const avancado = manifestoBase(); avancado.dependencies.enabledAdvancedServices.push({ userSymbol: 'Gmail', serviceId: 'gmail', version: 'v1' });
  assert.ok(S.verificarConfiguracao(avancado, srcBase()).some((a) => /serviço avançado não previsto: gmail/.test(a.tipo)));
  const web = manifestoBase(); web.webapp = { access: 'ANYONE' };
  assert.ok(S.verificarConfiguracao(web, srcBase()).some((a) => /web app/.test(a.tipo)));
  const lib = manifestoBase(); lib.libraries = [{ userSymbol: 'X', libraryId: 'abc', version: '1' }];
  assert.ok(S.verificarConfiguracao(lib, srcBase()).some((a) => /biblioteca/.test(a.tipo)));
  const fuso = manifestoBase(); fuso.timeZone = 'UTC';
  assert.ok(S.verificarConfiguracao(fuso, srcBase()).length > 0);
});

test('serviço do Google novo no código (UrlFetchApp, DriveApp, GmailApp...) faz o gate falhar até haver decisão registrada', () => {
  for (const servico of ['UrlFetchApp', 'DriveApp', 'GmailApp', 'CalendarApp', 'HtmlService', 'ContentService', 'Session', 'CacheService']) {
    const src = { ...srcBase(), 'Novo.js': `function f() { return ${servico}.alguma(); }` };
    assert.ok(S.verificarConfiguracao(manifestoBase(), src).some((a) => a.tipo.includes(servico)), servico);
  }
  const comentario = { ...srcBase(), 'Novo.js': '// UrlFetchApp.fetch(x) seria proibido' };
  assert.equal(S.verificarConfiguracao(manifestoBase(), comentario).length, 0, 'citar o nome em comentário não conta');
});

test('todo serviço permitido tem uma linha própria em docs/gate/SERVICOS-GOOGLE.md (justificativa registrada)', () => {
  const doc = fs.readFileSync(path.join(raiz, 'docs', 'gate', 'SERVICOS-GOOGLE.md'), 'utf8');
  for (const s of S.SERVICOS_PERMITIDOS) assert.match(doc, new RegExp(`^\\| ${s}( \\(|\\s)`, 'm'), `serviço sem justificativa registrada: ${s}`);
  const linhasDoc = [...doc.matchAll(/^\| ([A-Za-z]+)( \(|\s)/gm)].map((m) => m[1]).filter((n) => S.SERVICOS_CONHECIDOS_DO_GOOGLE.includes(n));
  for (const n of linhasDoc) assert.ok(S.SERVICOS_PERMITIDOS.includes(n), `serviço na doc, mas fora do código de verificação: ${n}`);
});

test('o pacote de produção também passa na verificação de configuração e continua sem escopo amplo nem escrita na agenda', () => {
  const pacote = montarPacoteProducao();
  const texto = Object.fromEntries(pacote.arquivos.map((a) => [a.nome, a.conteudo]));
  assert.equal(S.verificarConfiguracao(pacote.manifesto, texto).length, 0);
  assert.ok(!pacote.manifesto.oauthScopes.some((e) => /\/(drive|calendar|calendar\.events|spreadsheets|gmail\.[a-z]+)$/.test(e)));
});

// ---------- (d) registro de exceções (Stackdriver) ----------
// exceptionLogging: STACKDRIVER manda ao Cloud Logging a exceção que ESCAPA de uma função de entrada. Se nenhuma sai pela porta da frente,
// só o que o próprio kit registra (texto fixo) existe. Experimento: cada serviço do Google lança erro com nome, CPF e condição fictícios.

const SENSIVEL_FICTICIO = 'NOME_FICTICIO CPF_FICTICIO CONDICAO_FICTICIA';
const ENTRADAS_DE_MENU = [...fs.readFileSync(path.join(raiz, 'src', 'Menu.js'), 'utf8').matchAll(/\.addItem\('[^']*', '([A-Za-z_]+)'\)/g)].map((m) => m[1]);

function consultorioPronto() {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda(); gerarAReceber()');
  c.selecionar('Pagamentos', 2);
  c.rodar('marcarPagoPix()');
  c.definir('Pagamentos', 2, 'pagador_nome', 'Maria Souza Teste');
  return c;
}

// Cada ponto de falha troca um serviço por um que lança o texto sensível.
const PONTOS_DE_FALHA = {
  planilha: (c) => { c.amb.planilha.getSheetByName = () => { throw new Error(SENSIVEL_FICTICIO); }; },
  leituraDeAba: (c) => { for (const n of ['Pagamentos', 'Consultas', 'Pacientes', 'Pacotes', 'Configurações']) { const a = c.amb.abas.get(n); a.getRange = () => { throw new Error(SENSIVEL_FICTICIO); }; } },
  agendaLista: (c) => { c.amb.contexto.Calendar = { Events: { list: () => { throw new Error(SENSIVEL_FICTICIO); }, get: () => { throw new Error(SENSIVEL_FICTICIO); } } }; },
  driveLista: (c) => { c.amb.contexto.Drive.Files.list = () => { throw new Error(SENSIVEL_FICTICIO); }; },
  driveCria: (c) => { c.amb.contexto.Drive.Files.create = () => { throw new Error(SENSIVEL_FICTICIO); }; },
  driveCopia: (c) => { c.amb.contexto.Drive.Files.copy = () => { throw new Error(SENSIVEL_FICTICIO); }; },
  docs: (c) => { c.amb.contexto.DocumentApp.openById = () => { throw new Error(SENSIVEL_FICTICIO); }; },
  propriedades: (c) => { c.amb.contexto.PropertiesService = { getDocumentProperties: () => { throw new Error(SENSIVEL_FICTICIO); } }; },
  gatilhos: (c) => { c.amb.contexto.ScriptApp = { getProjectTriggers: () => { throw new Error(SENSIVEL_FICTICIO); }, newTrigger: () => { throw new Error(SENSIVEL_FICTICIO); } }; },
  trava: (c) => { c.amb.contexto.LockService = { getScriptLock: () => { throw new Error(SENSIVEL_FICTICIO); } }; },
  email: (c) => { c.amb.contexto.MailApp = { sendEmail: () => { throw new Error(SENSIVEL_FICTICIO); } }; },
};

test('nenhuma função de menu deixa escapar exceção crua (nada chega ao Stackdriver) e o texto sensível não vai a Registro, e-mail, nome de arquivo nem Logger', () => {
  assert.ok(ENTRADAS_DE_MENU.length >= 15, 'não achou os itens de menu');
  const escaparam = [];
  for (const [ponto, quebrar] of Object.entries(PONTOS_DE_FALHA)) {
    for (const entrada of ENTRADAS_DE_MENU.filter((e) => !/Teste|teste/.test(e))) {
      const c = consultorioPronto();
      const logs = [];
      c.amb.contexto.Logger = { log: (m) => logs.push(String(m)) };
      c.selecionar('Pagamentos', 2);
      quebrar(c);
      try {
        c.rodar(`${entrada}()`);
      } catch (e) {
        escaparam.push(`${ponto} -> ${entrada}`);
      }
      const vazamento = `${textoQuePodeVazar(c)}\n${logs.join('\n')}`;
      assert.doesNotMatch(vazamento, /NOME_FICTICIO|CPF_FICTICIO|CONDICAO_FICTICIA/, `vazou em ${ponto} -> ${entrada}`);
    }
  }
  assert.deepEqual(escaparam, [], 'exceção crua escapou da função de menu e iria ao registro de exceções');
});

test('o gatilho automático da agenda também não deixa escapar exceção crua', () => {
  for (const [ponto, quebrar] of Object.entries(PONTOS_DE_FALHA)) {
    const c = consultorioPronto();
    quebrar(c);
    assert.doesNotThrow(() => c.rodar('sincronizarAgendaAutomatica()'), ponto);
    assert.doesNotMatch(textoQuePodeVazar(c), /NOME_FICTICIO|CPF_FICTICIO|CONDICAO_FICTICIA/, ponto);
  }
});

test('o que ESCAPA hoje, por desenho: funções internas chamadas direto (fora do menu) e onOpen. Elas não recebem dado de paciente em texto de erro por contrato do kit, e isto fica documentado', () => {
  const c = consultorioPronto();
  PONTOS_DE_FALHA.leituraDeAba(c);
  // chamada direta de função interna: a exceção crua sobe (é o comportamento que o experimento mede)
  assert.throws(() => c.rodar('gerarRecibo(2)'), /NOME_FICTICIO/);
  assert.throws(() => c.rodar('sincronizarAgenda()'), /NOME_FICTICIO/);
  // As funções acima não são itens de menu nem gatilho: só rodam pelo editor do Apps Script, aberto só pela dona do projeto.
});
