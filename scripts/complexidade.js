// Mede o tamanho das funções de src/ e aponta as que misturam responsabilidades (Gate, item 34). Só leitura: não altera nada.
// Não há limite "certo" de linhas: o que importa é a mistura de interface + regra + Google + gravação + registro numa função só,
// porque isso dificulta o teste de falhas. A heurística é por texto (sem dependências) e serve para priorizar a leitura humana.
// Uso: node scripts/complexidade.js [--escrever docs/gate/COMPLEXIDADE.md] [--json]
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const PASTA_SRC = path.join(RAIZ, 'src');

// Responsabilidades reconhecidas por texto dentro do corpo da função.
const RESPONSABILIDADES = [
  ['interface', /\b(ui\.(alert|prompt|createMenu|showModal)|getUi\(\)|\bmostrar[A-Z]\w*\(|\bperguntar\w*\(|executarNoMenu_\()/],
  ['google', /\b(SpreadsheetApp|Calendar\.|Drive\.|DocumentApp|MailApp|ScriptApp|LockService|UrlFetchApp|driveCriar\w*|driveListar\w*|driveAcharPorPapel|driveAcharNaPasta|driveMandarParaLixeira|driveExportar\w*)\b/],
  ['planilha', /\b(lerAba\w*|lerLinhas\w*|adicionarLinhas|gravarLinha|gravarCelula|apagarLinhas?|getRange|setValues|getValues)\b/],
  ['regra', /\b(planejar\w+|validar\w+|calcular\w+|reconciliar\w+|escolherReciboExistente|montar\w+|preparar\w+|precoParaCobranca|resolverPapel\w*)\(/],
  ['registro', /\bregistrar(Erro|Alerta)?\(/],
];

// Cabeçalho de função de nível de cima: "function nome(" ou "async function nome(".
const CABECALHO = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;

// Devolve [{ arquivo, nome, inicio, linhas, corpo }] achando o fim pela chave de fechamento no começo da linha.
function funcoesDoArquivo(arquivo, texto) {
  const linhas = texto.split('\n');
  const achadas = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = CABECALHO.exec(linhas[i]);
    if (!m) continue;
    let fim = i;
    // função de uma linha só ("function f() { ... }")
    if (!/\{\s*$/.test(linhas[i]) && /\}\s*$/.test(linhas[i])) fim = i;
    else { while (fim < linhas.length && !/^\}/.test(linhas[fim])) fim++; }
    achadas.push({ arquivo, nome: m[1], inicio: i + 1, linhas: fim - i + 1, corpo: linhas.slice(i, fim + 1).join('\n') });
    i = fim;
  }
  return achadas;
}

function classificar(funcao) {
  const corpo = funcao.corpo.split('\n').slice(1).join('\n').replace(/^\s*\/\/.*$/gm, '');
  const tags = RESPONSABILIDADES.filter(([, re]) => re.test(corpo)).map(([nome]) => nome);
  return { ...funcao, tags };
}

function medir(pasta = PASTA_SRC) {
  const todas = [];
  for (const arquivo of fs.readdirSync(pasta).filter((a) => a.endsWith('.js')).sort()) {
    for (const f of funcoesDoArquivo(arquivo, fs.readFileSync(path.join(pasta, arquivo), 'utf8'))) todas.push(classificar(f));
  }
  return todas;
}

// Candidata a separar: mistura interface ou Google com regra E com gravação, e é longa o bastante para esconder falhas.
function candidata(f) {
  const t = new Set(f.tags);
  const tocaGoogle = t.has('google') || t.has('interface') || t.has('planilha');
  return f.linhas >= 25 && tocaGoogle && t.size >= 4;
}

function relatorio(funcoes) {
  const porTamanho = [...funcoes].sort((a, b) => b.linhas - a.linhas);
  const mistas = funcoes.filter(candidata).sort((a, b) => b.linhas - a.linhas);
  const total = funcoes.length;
  const soma = funcoes.reduce((s, f) => s + f.linhas, 0);
  const faixa = (min, max) => funcoes.filter((f) => f.linhas >= min && f.linhas <= max).length;
  const linhasTabela = (lista) => lista.map((f) => `| \`${f.arquivo}\` | \`${f.nome}\` | ${f.linhas} | ${f.tags.join(', ') || 'só lógica'} |`).join('\n');
  return [
    `Funções de nível de cima em src/: ${total} (média ${(soma / total).toFixed(1)} linhas). Até 10 linhas: ${faixa(0, 10)}; 11 a 25: ${faixa(11, 25)}; 26 a 50: ${faixa(26, 50)}; acima de 50: ${faixa(51, 9999)}.`,
    '',
    '### 15 maiores funções',
    '| Arquivo | Função | Linhas | Responsabilidades (por texto) |', '|---|---|---|---|',
    linhasTabela(porTamanho.slice(0, 15)),
    '',
    `### Candidatas a separar (>= 25 linhas, toca Google/planilha/interface e mistura 4 ou mais responsabilidades): ${mistas.length}`,
    '| Arquivo | Função | Linhas | Responsabilidades (por texto) |', '|---|---|---|---|',
    linhasTabela(mistas),
  ].join('\n');
}

if (require.main === module) {
  const funcoes = medir();
  if (process.argv.includes('--json')) console.log(JSON.stringify(funcoes.map(({ corpo, ...resto }) => resto), null, 2));
  else console.log(relatorio(funcoes));
  const i = process.argv.indexOf('--escrever');
  if (i >= 0) fs.writeFileSync(path.resolve(RAIZ, process.argv[i + 1]), `${relatorio(funcoes)}\n`);
}

module.exports = { funcoesDoArquivo, classificar, medir, candidata, relatorio, RESPONSABILIDADES };
