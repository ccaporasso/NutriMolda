// Cobertura da suíte sobre src/ (cobertura nativa do Node, sem dependência nova).
// Uso: node scripts/cobertura.js [--detalhe] [--exigir] [--escrever docs/gate/COBERTURA.md]
//   --detalhe  lista as linhas e os ramos (branches) não executados de cada módulo
//   --exigir   sai com código 1 se um módulo crítico ficar abaixo do piso de PISOS_CRITICOS (usado por scripts/gate.js)
// Só roda os testes e lê o resultado. Não envia nada ao Google e não lê dado de paciente.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

// Criticidade: o módulo mexe em dinheiro, consulta, documento, configuração ou na segurança dos dados?
const CRITICOS = [
  'Acoes.js', 'Pagamentos.js', 'GerarAReceber.js', 'Agenda.js', 'SincronizarAgenda.js', 'GeradorRecibo.js', 'Recibo.js',
  'Relatorio.js', 'GerarRelatorio.js', 'Precos.js', 'LeitorAbas.js', 'LeitorConfiguracoes.js', 'Configuracoes.js', 'DriveAvancado.js',
  'Pix.js', 'Formatos.js', 'Registro.js', 'Alertas.js', 'Execucao.js', 'Menu.js',
];
const SOMENTE_TESTE = ['DadosTeste.js', 'GeradorTeste.js'];

// Pisos por módulo crítico (percentuais). Fixados abaixo do menor valor medido nos módulos críticos em 01/10/2026 (linhas 100, ramos 96,8, funções 100), para uma queda
// de cobertura ser pega pelo gate, sem exigir 100% (ramo defensivo ou que só o Google real exercita fica de fora; ver COBERTURA.md).
const PISO_LINHAS = 99;
const PISO_RAMOS = 95;
const PISO_FUNCOES = 99;

function rodarComCobertura() {
  const pasta = path.join(RAIZ, 'dist', 'cobertura');
  fs.mkdirSync(pasta, { recursive: true });
  const lcov = path.join(pasta, 'lcov.info');
  const r = spawnSync(process.execPath, [
    '--test', '--experimental-test-coverage', '--test-coverage-include=src/**',
    '--test-reporter=lcov', `--test-reporter-destination=${lcov}`, '--test-reporter=spec', '--test-reporter-destination=stdout',
  ], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const saida = r.stdout || '';
  const resumo = {
    testes: Number((/^ℹ tests (\d+)/m.exec(saida) || [])[1] || NaN), aprovados: Number((/^ℹ pass (\d+)/m.exec(saida) || [])[1] || NaN),
    falhos: Number((/^ℹ fail (\d+)/m.exec(saida) || [])[1] || NaN),
  };
  return { codigo: r.status, lcov: fs.existsSync(lcov) ? fs.readFileSync(lcov, 'utf8') : '', resumo, saida, erro: r.stderr };
}

function lerLcov(texto) {
  const modulos = {};
  let m = null;
  for (const linha of texto.split('\n')) {
    if (linha.startsWith('SF:')) { m = { arquivo: path.basename(linha.slice(3)), linhas: new Map(), ramos: [], funcoes: new Map() }; modulos[m.arquivo] = m; continue; }
    if (!m) continue;
    let g;
    if ((g = /^DA:(\d+),(\d+)/.exec(linha))) m.linhas.set(Number(g[1]), Number(g[2]));
    else if ((g = /^BRDA:(\d+),(\d+),(\d+),(\d+|-)/.exec(linha))) m.ramos.push({ linha: Number(g[1]), tomado: g[4] !== '-' && Number(g[4]) > 0 });
    else if ((g = /^FNDA:(\d+),(.*)$/.exec(linha))) m.funcoes.set(g[2], Number(g[1]));
  }
  return modulos;
}

const pct = (a, b) => (b === 0 ? 100 : (100 * a) / b);
const fmt = (n) => n.toFixed(2).padStart(6);

function medir(m) {
  const linhasTot = m.linhas.size;
  const linhasOk = [...m.linhas.values()].filter((n) => n > 0).length;
  const ramosOk = m.ramos.filter((r) => r.tomado).length;
  const funcOk = [...m.funcoes.values()].filter((n) => n > 0).length;
  return {
    linhas: pct(linhasOk, linhasTot), ramos: pct(ramosOk, m.ramos.length), funcoes: pct(funcOk, m.funcoes.size),
    nLinhas: [linhasOk, linhasTot], nRamos: [ramosOk, m.ramos.length], nFuncoes: [funcOk, m.funcoes.size],
    linhasNaoExecutadas: [...m.linhas].filter(([, n]) => n === 0).map(([l]) => l),
    ramosNaoTomados: [...new Set(m.ramos.filter((r) => !r.tomado).map((r) => r.linha))].sort((a, b) => a - b),
    funcoesNaoExecutadas: [...m.funcoes].filter(([, n]) => n === 0).map(([f]) => f),
  };
}

function resumirTudo(modulos) {
  const soma = { linhas: [0, 0], ramos: [0, 0], funcoes: [0, 0] };
  const linhas = [];
  for (const [arquivo, m] of Object.entries(modulos).sort()) {
    const x = medir(m);
    const criticidade = CRITICOS.includes(arquivo) ? 'crítica' : (SOMENTE_TESTE.includes(arquivo) ? 'só teste' : 'normal');
    linhas.push({ arquivo, criticidade, ...x });
    for (const k of ['linhas', 'ramos', 'funcoes']) { soma[k][0] += x[`n${k[0].toUpperCase()}${k.slice(1)}`][0]; soma[k][1] += x[`n${k[0].toUpperCase()}${k.slice(1)}`][1]; }
  }
  return { modulos: linhas, total: { linhas: pct(...soma.linhas), ramos: pct(...soma.ramos), funcoes: pct(...soma.funcoes), n: soma } };
}

function tabelaMarkdown(r) {
  const cab = '| Módulo | Linhas | Ramos (branches) | Funções | Criticidade |\n|---|---|---|---|---|';
  const lin = r.modulos.map((m) => `| ${m.arquivo} | ${m.linhas.toFixed(1)}% (${m.nLinhas.join('/')}) | ${m.ramos.toFixed(1)}% (${m.nRamos.join('/')}) | ${m.funcoes.toFixed(1)}% (${m.nFuncoes.join('/')}) | ${m.criticidade} |`);
  const t = r.total;
  lin.push(`| **Total src/** | **${t.linhas.toFixed(1)}%** (${t.n.linhas.join('/')}) | **${t.ramos.toFixed(1)}%** (${t.n.ramos.join('/')}) | **${t.funcoes.toFixed(1)}%** (${t.n.funcoes.join('/')}) | |`);
  return [cab].concat(lin).join('\n');
}

function principal() {
  const args = process.argv.slice(2);
  const { codigo, lcov, resumo, saida, erro } = rodarComCobertura();
  if (!lcov) { console.error('Não consegui medir a cobertura.\n', erro || saida.slice(-2000)); process.exit(2); }
  const r = resumirTudo(lerLcov(lcov));
  console.log(`Testes: ${resumo.testes}, aprovados: ${resumo.aprovados}, falhos: ${resumo.falhos}`);
  console.log('Módulo                         Linhas  Ramos  Funções  Criticidade');
  for (const m of r.modulos) console.log(`${m.arquivo.padEnd(28)} ${fmt(m.linhas)} ${fmt(m.ramos)} ${fmt(m.funcoes)}   ${m.criticidade}`);
  console.log(`${'TOTAL src/'.padEnd(28)} ${fmt(r.total.linhas)} ${fmt(r.total.ramos)} ${fmt(r.total.funcoes)}`);
  if (args.includes('--detalhe')) {
    for (const m of r.modulos) {
      if (m.linhasNaoExecutadas.length + m.ramosNaoTomados.length + m.funcoesNaoExecutadas.length === 0) continue;
      console.log(`\n${m.arquivo} (${m.criticidade})`);
      if (m.linhasNaoExecutadas.length) console.log(`  linhas não executadas: ${m.linhasNaoExecutadas.join(', ')}`);
      if (m.ramosNaoTomados.length) console.log(`  ramos não tomados (linha): ${m.ramosNaoTomados.join(', ')}`);
      if (m.funcoesNaoExecutadas.length) console.log(`  funções não executadas: ${m.funcoesNaoExecutadas.join(', ')}`);
    }
  }
  const i = args.indexOf('--escrever');
  if (i >= 0) fs.writeFileSync(path.resolve(RAIZ, args[i + 1]), `${tabelaMarkdown(r)}\n`);
  let ruim = codigo !== 0;
  if (args.includes('--exigir')) {
    for (const m of r.modulos.filter((x) => x.criticidade === 'crítica')) {
      const faltas = [];
      if (m.linhas < PISO_LINHAS) faltas.push(`linhas ${m.linhas.toFixed(1)} < ${PISO_LINHAS}`);
      if (m.ramos < PISO_RAMOS) faltas.push(`ramos ${m.ramos.toFixed(1)} < ${PISO_RAMOS}`);
      if (m.funcoes < PISO_FUNCOES) faltas.push(`funções ${m.funcoes.toFixed(1)} < ${PISO_FUNCOES}`);
      if (faltas.length) { console.error(`COBERTURA ABAIXO DO PISO em ${m.arquivo}: ${faltas.join('; ')}`); ruim = true; }
    }
  }
  process.exit(ruim ? 1 : 0);
}

if (require.main === module) principal();
module.exports = { lerLcov, medir, resumirTudo, tabelaMarkdown, CRITICOS, PISO_LINHAS, PISO_RAMOS, PISO_FUNCOES };
