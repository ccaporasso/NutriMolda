// Revisão do próprio código (T00 a T11): conferências automáticas entre código, documentos e regras do projeto.
// Cada teste aqui nasceu de uma inconsistência real que a revisão encontrou ou de uma regra do CLAUDE.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
const arquivosDe = (pasta, ext) => fs.readdirSync(path.join(raiz, pasta)).filter((a) => a.endsWith(ext)).map((a) => path.join(pasta, a));
const manifesto = JSON.parse(ler('src', 'appsscript.json'));

const todoSrc = arquivosDe('src', '.js').map((a) => ler(a)).join('\n');
const rotulosDoMenu = [...todoSrc.matchAll(/\.addItem\('([^']*)'/g)].map((m) => m[1]);
const DOCS_DE_USO = ['docs/MANUAL-NUTRICIONISTA.md', 'docs/MANUAL-SUPORTE.md', 'docs/VALIDACAO-NO-GOOGLE.md', 'docs/PRIMEIROS-PASSOS.md', 'README.md'];

test('todo item de menu citado nos manuais existe com esse nome exato', () => {
  assert.ok(rotulosDoMenu.length >= 16);
  const inicio = /^(Marcar |Gerar |Sincronizar|Criar |Instalar|Ativar |Testar |Relatório do mês|TESTE:)/;
  for (const doc of DOCS_DE_USO) {
    const texto = ler(doc);
    const citados = [...texto.matchAll(/"([^"\n]{4,60})"|\*\*([^*\n]{4,60})\*\*/g)].map((m) => (m[1] || m[2]).replace(/[:.]$/, '')).filter((t) => inicio.test(t));
    for (const c of citados) {
      assert.ok(rotulosDoMenu.some((r) => r === c || r.startsWith(c)), `${doc} cita o item "${c}", que não existe no menu`);
    }
  }
});

test('DECISOES.md: a tabela de escopos não é quebrada por linha em branco (senão vira texto solto)', () => {
  const linhas = ler('docs', 'DECISOES.md').split('\n');
  linhas.forEach((l, i) => {
    if (/^\| `[a-z_.]+` \|/.test(l)) assert.ok(i > 0 && linhas[i - 1].startsWith('|'), `linha ${i + 1} de DECISOES.md ficou fora da tabela`);
  });
});

test('todo escopo de appsscript.json tem uma linha na tabela de escopos de DECISOES.md', () => {
  const decisoes = ler('docs', 'DECISOES.md');
  for (const escopo of manifesto.oauthScopes) {
    const nome = escopo.split('/').pop();
    assert.match(decisoes, new RegExp(`^\\| \`${nome.replace(/\./g, '\\.')}\` \\|`, 'm'), `escopo sem linha própria na tabela: ${nome}`);
  }
});

test('todo escopo declarado é usado por alguma chamada do código (nada de permissão sobrando)', () => {
  const usos = {
    'spreadsheets.currentonly': /SpreadsheetApp\./,
    'script.send_mail': /MailApp\./,
    'calendar.events': /Calendar\.Events\./,
    'script.scriptapp': /ScriptApp\./,
    documents: /DocumentApp\./,
    'drive.file': /DriveApp\./,
  };
  for (const escopo of manifesto.oauthScopes) {
    const nome = escopo.split('/').pop();
    assert.ok(usos[nome], `escopo novo sem regra de uso neste teste: ${nome}`);
    assert.match(todoSrc, usos[nome], `escopo declarado mas sem uso: ${nome}`);
  }
});

test('o código usa cada serviço do Google só com o escopo declarado (nada de permissão faltando)', () => {
  const nomes = manifesto.oauthScopes.map((e) => e.split('/').pop());
  const precisa = [
    [/SpreadsheetApp\./, 'spreadsheets.currentonly'], [/MailApp\./, 'script.send_mail'], [/Calendar\.Events\./, 'calendar.events'],
    [/ScriptApp\./, 'script.scriptapp'], [/DocumentApp\./, 'documents'], [/DriveApp\./, 'drive.file'],
  ];
  for (const [uso, escopo] of precisa) if (uso.test(todoSrc)) assert.ok(nomes.includes(escopo), `usa ${uso} sem o escopo ${escopo}`);
  // serviços que exigiriam escopo amplo e não devem aparecer
  for (const proibido of [/UrlFetchApp\./, /GmailApp\./, /ContactsApp\./, /SpreadsheetApp\.(openById|openByUrl|create)\(/, /CalendarApp\./]) {
    assert.doesNotMatch(todoSrc, proibido, `chamada não prevista: ${proibido}`);
  }
});

test('regra 2 e 3: nada de servidor próprio, web app ou WhatsApp não oficial no código', () => {
  assert.equal(manifesto.webapp, undefined);
  assert.equal(manifesto.executionApi, undefined);
  assert.doesNotMatch(todoSrc, /doGet|doPost|HtmlService|ContentService|UrlFetchApp|whatsapp-web|wa\.me|api\.whatsapp/i);
});

test('regra 4: sem IA no código', () => {
  assert.doesNotMatch(todoSrc, /anthropic|openai|gemini|gpt-|api\.claude|generativelanguage/i);
});

test('regra 1: só endereços e CPFs fictícios em código, testes e documentos', () => {
  const dominiosOk = new Set(['exemplo.invalid', 'exemplo.com', 'c.com', 'group.calendar.google.com']);
  const cpfsOk = new Set(['52998224725', '52998224724', '11111111111', '12345678909', '12345678901', '00123456789', '11912345678', '55119000000']);
  const arquivos = [...arquivosDe('src', '.js'), ...arquivosDe('tests', '.js'), ...arquivosDe('tests/apoio', '.js'), ...arquivosDe('docs', '.md'), 'README.md', 'CHANGELOG.md', 'CLAUDE.md'];
  for (const a of arquivos) {
    const texto = ler(a);
    for (const m of texto.matchAll(/[A-Za-z0-9._+-]+@([A-Za-z0-9.-]+\.[a-z]{2,})/g)) {
      assert.ok(dominiosOk.has(m[1].toLowerCase()), `${a}: endereço com domínio real: ${m[0]}`);
    }
    for (const m of texto.matchAll(/\b\d{11}\b/g)) {
      assert.ok(cpfsOk.has(m[0]), `${a}: número de 11 dígitos que não é um exemplo conhecido: ${m[0]}`);
    }
  }
});

test('tabela de tarefas: toda tarefa T00 a T11 tem situação e está no CHANGELOG', () => {
  const tarefas = ler('docs', 'TAREFAS.md');
  const changelog = ler('CHANGELOG.md');
  for (let n = 0; n <= 11; n++) {
    const codigo = `T${String(n).padStart(2, '0')}`;
    assert.match(tarefas, new RegExp(`\\| ${codigo} \\|`), `${codigo} não está em TAREFAS.md`);
    assert.match(changelog, new RegExp(`${codigo}[:,( ]`), `${codigo} não está no CHANGELOG.md`);
  }
});

test('validação no Google: toda tarefa com chamada ao Google tem uma seção em VALIDACAO-NO-GOOGLE.md', () => {
  const v = ler('docs', 'VALIDACAO-NO-GOOGLE.md');
  for (const t of ['T05', 'T07', 'T08', 'T09', 'T10']) assert.match(v, new RegExp(`^## ${t} `, 'm'), `falta a seção ${t}`);
});
