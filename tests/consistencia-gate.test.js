// Consistência dos documentos do Gate (item 19, "consistência documental relevante"): o que os documentos citam existe, o registro de achados
// mantém o histórico, o relatório de mutação cobre todas as mutações do script e nada é chamado de E1 sem ter sido observado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../scripts/mutacoes.js');

const raiz = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
const docsDoGate = fs.readdirSync(path.join(raiz, 'docs', 'gate')).filter((a) => a.endsWith('.md'));
const textoDosDocs = docsDoGate.map((a) => [a, ler('docs', 'gate', a)]);

test('tudo o que os documentos do Gate citam como teste ou script existe', () => {
  for (const [doc, texto] of textoDosDocs) {
    for (const m of texto.matchAll(/`?(tests\/(?:apoio\/)?[a-z0-9-]+\.(?:test\.)?js)`?/g)) assert.ok(fs.existsSync(path.join(raiz, m[1])), `${doc} cita ${m[1]}, que não existe`);
    for (const m of texto.matchAll(/`?(scripts\/[a-z0-9-]+\.js)`?/g)) assert.ok(fs.existsSync(path.join(raiz, m[1])), `${doc} cita ${m[1]}, que não existe`);
    for (const m of texto.matchAll(/`(docs\/gate\/[A-Za-z0-9-]+\.md)`/g)) {
      if (/AAAA/.test(m[1])) continue; // modelo de nome de arquivo ainda não criado
      assert.ok(fs.existsSync(path.join(raiz, m[1])), `${doc} cita ${m[1]}, que não existe`);
    }
  }
});

test('ACHADOS.md: cada linha da tabela tem a seção correspondente e vice-versa; achado corrigido guarda regressão e onde foi corrigido; o histórico não é apagado', () => {
  const doc = ler('docs', 'gate', 'ACHADOS.md');
  const linhas = [...doc.matchAll(/^\| (A-\d+) \| .* \| (.*?) \|$/gm)].map((m) => [m[1], m[2]]);
  const secoes = new Map(doc.split(/^## /m).slice(1).map((s) => [s.split(' ')[0], s]));
  assert.ok(linhas.length >= 18);
  assert.deepEqual(linhas.map((l) => l[0]), [...secoes.keys()], 'tabela e seções fora de sincronia');
  assert.deepEqual(linhas.map((l) => l[0]), linhas.map((_, i) => `A-${String(i + 1).padStart(2, '0')}`), 'ids fora de sequência (nenhum achado some)');
  for (const [id, estado] of linhas) {
    const s = secoes.get(id);
    if (/^Corrigido/.test(estado)) {
      assert.match(s, /Corrigido em/, `${id} corrigido sem dizer onde`);
      assert.ok(/REGRESSÃO|ferramenta/.test(s), `${id} corrigido sem teste de regressão`);
    }
    if (/^Aberto/.test(estado)) assert.match(s, /Decisão do Caio|decisão do Caio|Impacto|documentado/i, `${id} aberto sem dizer o impacto ou quem decide`);
    assert.match(s, /Encontrado em|Ver `docs|`executarNoMenu_`/, `${id} sem dizer onde foi encontrado`);
  }
});

test('ACHADOS.md: todo teste de regressão citado existe e roda (nome de arquivo real)', () => {
  const doc = ler('docs', 'gate', 'ACHADOS.md');
  for (const m of doc.matchAll(/tests\/([a-z0-9-]+\.test\.js)/g)) assert.ok(fs.existsSync(path.join(raiz, 'tests', m[1])), m[1]);
});

test('MUTACOES.md: a tabela traz TODAS as mutações do script, cada uma detectada (nenhuma sobrevivente ou inaplicável)', () => {
  const doc = ler('docs', 'gate', 'MUTACOES.md');
  const tabela = doc.slice(doc.indexOf(M.MARCA_DA_TABELA));
  const ids = [...tabela.matchAll(/^\| (M\d+[a-z]?) \|/gm)].map((m) => m[1]);
  assert.deepEqual([...ids].sort(), M.MUTACOES.map((m) => m[0]).sort(), 'rode node scripts/mutacoes.js --escrever docs/gate/MUTACOES.md');
  assert.equal(new Set(M.MUTACOES.map((m) => m[0])).size, M.MUTACOES.length, 'id de mutação repetido');
  for (const linha of tabela.split('\n').filter((l) => /^\| M\d+/.test(l))) assert.match(linha, /\| detectada \(\d+ teste\(s\) falharam\)/, linha.slice(0, 60));
  assert.doesNotMatch(tabela, /SOBREVIVEU|NÃO APLICÁVEL/);
});

test('relatório de mutação: reescrever a tabela preserva o histórico escrito à mão', () => {
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-mut-')), 'M.md');
  fs.writeFileSync(arquivo, `# Título\n\nHistórico que não pode sumir.\n\n${M.MARCA_DA_TABELA}\n\n| tabela velha |\n`);
  M.escreverRelatorio(arquivo, '| tabela nova |');
  const texto = fs.readFileSync(arquivo, 'utf8');
  assert.match(texto, /Histórico que não pode sumir\./);
  assert.match(texto, /tabela nova/);
  assert.doesNotMatch(texto, /tabela velha/);
  fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
});

test('GOOGLE-REAL.md: preparado e não executado; cada item está N/M e só vira E1 com data, executor e commit registrados em arquivo de resultados', () => {
  const doc = ler('docs', 'gate', 'GOOGLE-REAL.md');
  assert.match(doc, /PREPARADO, NÃO EXECUTADO/);
  const itens = doc.split('\n').filter((l) => /^\| \d+ \|/.test(l));
  assert.ok(itens.length >= 21);
  assert.deepEqual(itens.map((l) => Number(l.split('|')[1])), itens.map((_, i) => i + 1), 'itens fora de sequência');
  const resultados = docsDoGate.filter((a) => /^RESULTADOS-GOOGLE-REAL-\d{4}-\d{2}-\d{2}\.md$/.test(a));
  if (resultados.length === 0) {
    for (const l of itens) assert.match(l, /\| N\/M( \(não executado\))? \|$/, `item marcado sem registro de execução: ${l.slice(0, 40)}`);
  }
  for (const a of resultados) {
    const t = ler('docs', 'gate', a);
    for (const bloco of t.split(/^Item: /m).slice(1)) {
      assert.match(bloco, /Data: \d{4}-\d{2}-\d{2}/);
      assert.match(bloco, /Quem: \S+/);
      assert.match(bloco, /Commit: [0-9a-f]{7,40}/);
    }
  }
  // as referências cruzadas dos outros documentos apontam para itens que existem e dizem o que se espera
  const itemDe = (n) => itens.find((l) => Number(l.split('|')[1]) === n) || '';
  assert.match(itemDe(5), /Escopos concedidos/);
  assert.match(itemDe(9), /Pix/);
  assert.match(itemDe(14), /CSV e fórmulas/);
  assert.match(itemDe(18), /Isolamento A x B/);
});

test('nenhum documento do Gate afirma execução no Google real (E1) sem registro: a palavra E1 só aparece como legenda ou como regra', () => {
  for (const [doc, texto] of textoDosDocs) {
    if (/^RESULTADOS-GOOGLE-REAL/.test(doc) || doc === 'GOOGLE-REAL.md') continue;
    for (const linha of texto.split('\n')) {
      if (!/\bE1\b/.test(linha)) continue;
      assert.match(linha, /(\*\*E1\*\*|E1 somente|nenhuma|Nenhuma|N\/M|não|só vira|E1 = |E1, E2|E1\)|E1 (é|\(|execução)|E1 e|\bE1:)/i, `${doc}: linha menciona E1 sem ser legenda ou ressalva: ${linha.slice(0, 90)}`);
    }
  }
});
