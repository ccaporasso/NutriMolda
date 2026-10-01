// Gate local do Kit do Consultório: UM comando que roda, em ordem, tudo o que prova que a base está íntegra (Gate, item 19).
// Uso: node scripts/gate.js [--mutacao] [--estrito] [--sem-historico]
//   --mutacao       também roda as mutações manuais (leva alguns minutos); sem isso a linha "Mutação" aparece como N/M
//   --estrito       trata aviso (WARN) como falha (é o que o CI usa): evidência desatualizada não passa
//   --sem-historico não varre o histórico do Git (por padrão varre; clone raso aparece como N/M)
// Não envia nada ao Google, não usa dado real e não precisa de dependências. Saída diferente de zero se qualquer passo falhar.
// Estados: PASS, FAIL, WARN (passa, mas precisa de olhar), N/M (não medido: nunca é escondido nem contado como PASS).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const MINIMO_NODE_MAJOR = 22;
// Piso do número de testes: apagar teste sem decidir isso aqui faz o gate falhar. Suba o piso quando a suíte crescer de propósito.
const MINIMO_TESTES = 577;

const ARQUIVOS_OBRIGATORIOS = [
  'CLAUDE.md', 'README.md', 'CHANGELOG.md', '.nvmrc', 'package.json', '.github/workflows/ci.yml', 'src/appsscript.json',
  'docs/ESPECIFICACAO.md', 'docs/DECISOES.md', 'docs/SEGURANCA-LGPD.md', 'docs/TAREFAS.md',
  'docs/gate/ACHADOS.md', 'docs/gate/MATRIZ-INTEGRIDADE.md', 'docs/gate/REPRODUCAO.md', 'docs/gate/GOOGLE-REAL.md',
  'docs/gate/CRITERIOS.md', 'docs/gate/REAUDITORIA.md', 'scripts/pontuacao.js',
];
// Nunca devem estar no Git (dados, credencial local, pacote gerado).
const PROIBIDOS_NO_GIT = [/\.csv$/i, /\.xlsx$/i, /\.pdf$/i, /(^|\/)\.clasp\.json$/, /(^|\/)\.clasprc\.json$/, /^dist\//, /^node_modules\//, /(^|\/)\.env/];
// Núcleo de integridade: os testes que provam idempotência, invariantes e adversários. Roda de novo, à parte, para aparecer numa linha só.
const TESTES_DE_INTEGRIDADE = [
  'tests/recibo-idempotencia.test.js', 'tests/modelo-pasta-idempotencia.test.js', 'tests/operacoes-idempotentes.test.js',
  'tests/invariantes-financeiros.test.js', 'tests/relatorio-integridade.test.js', 'tests/agenda-adversa.test.js', 'tests/ramos-criticos.test.js',
  'tests/falhas-parciais-operacoes.test.js', 'tests/precos-falha-parcial.test.js',
];
const TESTES_DE_DOCUMENTOS = ['tests/revisao.test.js', 'tests/estrutura.test.js', 'tests/inventario-codigo.test.js', 'tests/consistencia-gate.test.js', 'tests/reproducao.test.js', 'tests/pontuacao.test.js'];

// ---------- lógica pura (testada em tests/gate.test.js) ----------

function lerResumoTestes(saida) {
  const n = (nome) => Number((new RegExp(`^(?:ℹ |# )${nome} (\\d+)`, 'm').exec(saida) || [])[1]);
  return { testes: n('tests'), aprovados: n('pass'), falhos: n('fail'), cancelados: n('cancelled'), pulados: n('skipped'), pendentes: n('todo') };
}

function avaliarTestes(r, codigo, minimo) {
  const problemas = [];
  if (codigo !== 0) problemas.push(`o comando terminou com código ${codigo}`);
  if ([r.testes, r.aprovados, r.falhos].some((x) => Number.isNaN(x))) problemas.push('não consegui ler o resumo dos testes');
  if (r.falhos > 0) problemas.push(`${r.falhos} teste(s) falharam`);
  if (r.cancelados > 0) problemas.push(`${r.cancelados} teste(s) cancelado(s)`);
  if (r.pulados > 0) problemas.push(`${r.pulados} teste(s) pulado(s) (nada pode ficar escondido atrás de skip)`);
  if (r.pendentes > 0) problemas.push(`${r.pendentes} teste(s) marcado(s) como todo`);
  if (minimo !== undefined && r.testes < minimo) problemas.push(`só ${r.testes} testes; o piso é ${minimo} (apagar teste exige subir o piso de propósito em scripts/gate.js)`);
  return problemas;
}

function avaliarVersaoNode(versao, recomendada) {
  const major = Number(String(versao).replace(/^v/, '').split('.')[0]);
  if (!(major >= MINIMO_NODE_MAJOR)) return { estado: 'FAIL', detalhe: [`Node ${versao}: o mínimo é a família ${MINIMO_NODE_MAJOR}`] };
  const igual = String(versao).replace(/^v/, '') === String(recomendada).replace(/^v/, '');
  return { estado: igual ? 'PASS' : 'WARN', detalhe: [`Node ${String(versao).replace(/^v/, '')}${igual ? '' : ` (recomendado ${String(recomendada).replace(/^v/, '')}, em .nvmrc)`}`] };
}

// Passos: [{ nome, estado, detalhe: [] }]. Em modo estrito, WARN conta como falha.
function resultadoFinal(passos, estrito = false) {
  const falhou = passos.some((p) => p.estado === 'FAIL' || (estrito && p.estado === 'WARN'));
  const nm = passos.filter((p) => p.estado === 'N/M').map((p) => p.nome);
  const avisos = passos.filter((p) => p.estado === 'WARN').map((p) => p.nome);
  if (falhou) return { texto: 'FAIL', codigo: 1 };
  const extras = [].concat(avisos.length ? [`${avisos.length} aviso(s)`] : [], nm.length ? [`${nm.length} não medido(s)`] : []);
  return { texto: extras.length ? `PASS (${extras.join('; ')})` : 'PASS', codigo: 0 };
}

function formatarRelatorio(passos, estrito = false) {
  const linhas = ['GATE LOCAL', ''];
  for (const p of passos) {
    linhas.push(`${p.nome.padEnd(22, '.')} ${p.estado}`);
    for (const d of p.detalhe || []) linhas.push(`   ${p.estado === 'PASS' ? '' : '- '}${d}`);
  }
  const r = resultadoFinal(passos, estrito);
  linhas.push('', `RESULTADO: ${r.texto}`);
  return linhas.join('\n');
}

// Estado de um passo a partir de uma lista de problemas.
const passoPorProblemas = (nome, problemas, detalheOk = []) => ({ nome, estado: problemas.length ? 'FAIL' : 'PASS', detalhe: problemas.length ? problemas : detalheOk });

// ---------- execução ----------

function rodar(args, opcoes = {}) {
  const r = spawnSync(process.execPath, args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opcoes });
  return { codigo: r.status === null ? -1 : r.status, saida: `${r.stdout || ''}${r.stderr || ''}` };
}
function git(args) {
  const r = spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { codigo: r.status === null ? -1 : r.status, saida: `${r.stdout || ''}${r.stderr || ''}` };
}
const ultimas = (texto, n = 6) => texto.trim().split('\n').slice(-n);

function passoAmbiente() {
  const recomendada = fs.readFileSync(path.join(RAIZ, '.nvmrc'), 'utf8').trim();
  return { nome: 'Ambiente', ...avaliarVersaoNode(process.versions.node, recomendada) };
}

// Problemas de estrutura a partir de fatos já coletados (puro e testável): arquivos que existem, arquivos rastreados pelo Git e o package.json.
function problemasDeEstrutura({ existentes, rastreados, pacote }) {
  const problemas = [];
  for (const f of ARQUIVOS_OBRIGATORIOS) if (!existentes.includes(f)) problemas.push(`falta ${f}`);
  for (const f of rastreados) {
    if (PROIBIDOS_NO_GIT.some((re) => re.test(f))) problemas.push(`arquivo que não deve ir ao Git: ${f}`);
    if (f.startsWith('src/') && !/\.(js|json)$/.test(f)) problemas.push(`arquivo estranho em src/: ${f}`);
  }
  if (!pacote) problemas.push('package.json ilegível');
  else for (const campo of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (pacote[campo] && Object.keys(pacote[campo]).length) problemas.push(`package.json tem ${campo}: o projeto não usa dependências (regra 7)`);
  }
  return problemas;
}

function passoEstrutura() {
  const lista = git(['ls-files']);
  if (lista.codigo !== 0) return { nome: 'Estrutura', estado: 'N/M', detalhe: ['git indisponível: não conferi o que está rastreado'] };
  let pacote = null;
  try { pacote = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')); } catch (e) { pacote = null; }
  const existentes = ARQUIVOS_OBRIGATORIOS.filter((f) => fs.existsSync(path.join(RAIZ, f)));
  return passoPorProblemas('Estrutura', problemasDeEstrutura({ existentes, rastreados: lista.saida.split('\n').filter(Boolean), pacote }));
}

function passoTestes() {
  const r = rodar(['--test']);
  const resumo = lerResumoTestes(r.saida);
  const problemas = avaliarTestes(resumo, r.codigo, MINIMO_TESTES);
  return passoPorProblemas('Testes', problemas, [`${resumo.testes} testes, ${resumo.aprovados} aprovados, ${resumo.falhos} falhas, ${resumo.pulados} pulados`]);
}

let ultimaCobertura = '';
function passoCobertura() {
  const r = rodar(['scripts/cobertura.js', '--exigir']);
  ultimaCobertura = r.saida;
  const total = (r.saida.split('\n').find((l) => l.startsWith('TOTAL src/')) || '').trim().replace(/\s+/g, ' ');
  if (r.codigo !== 0) return { nome: 'Cobertura', estado: 'FAIL', detalhe: ultimas(r.saida, 8) };
  return { nome: 'Cobertura', estado: 'PASS', detalhe: [`piso por módulo crítico atendido; ${total} (linhas, ramos, funções)`] };
}

// A tabela em docs/gate/COBERTURA.md é evidência: se o código mudou e ela não, vira aviso.
function passoCoberturaDocumentada() {
  const { lerLcov, resumirTudo, tabelaMarkdown } = require('./cobertura.js');
  const lcov = path.join(RAIZ, 'dist', 'cobertura', 'lcov.info');
  if (!fs.existsSync(lcov)) return { nome: 'Cobertura documentada', estado: 'N/M', detalhe: ['sem medição desta execução'] };
  const atual = `${tabelaMarkdown(resumirTudo(lerLcov(fs.readFileSync(lcov, 'utf8'))))}\n`;
  const doc = fs.readFileSync(path.join(RAIZ, 'docs', 'gate', 'COBERTURA.md'), 'utf8');
  const igual = doc.includes(atual.trim());
  return { nome: 'Cobertura documentada', estado: igual ? 'PASS' : 'WARN', detalhe: igual ? ['docs/gate/COBERTURA.md bate com a medição'] : ['docs/gate/COBERTURA.md está desatualizada: rode node scripts/cobertura.js --escrever docs/gate/COBERTURA.md'] };
}

function passoProducao() {
  const r = rodar(['scripts/empacotar-producao.js']);
  const ok = r.codigo === 0;
  return { nome: 'Produção', estado: ok ? 'PASS' : 'FAIL', detalhe: ok ? ultimas(r.saida, 3).slice(0, 2) : ultimas(r.saida, 10) };
}

function passoEscopos() {
  const { verificarConfiguracao } = require('./seguranca.js');
  const src = {};
  for (const f of fs.readdirSync(path.join(RAIZ, 'src')).filter((x) => x.endsWith('.js'))) src[f] = fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8');
  const achados = verificarConfiguracao(JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'appsscript.json'), 'utf8')), src);
  return passoPorProblemas('Escopos', achados.map((a) => `${a.tipo} (${a.arquivo})`), ['escopos e serviços do Google dentro da lista aprovada']);
}

function passosDeVarredura(comHistorico) {
  const S = require('./seguranca.js');
  const arquivos = S.varrerArquivos();
  const grupo = (g) => arquivos.achados.filter((a) => a.grupo === g).map((a) => `${a.tipo} em ${a.arquivo}${a.linha ? `:${a.linha}` : ''}`);
  const passos = [
    passoPorProblemas('Dados de teste', grupo('PII'), [`${arquivos.arquivos} arquivos rastreados sem e-mail ou CPF fora da lista de exemplos`]),
    passoPorProblemas('Segredos', grupo('segredo'), ['nenhum padrão de chave, token ou segredo nos arquivos rastreados']),
  ];
  if (!comHistorico) {
    passos.push({ nome: 'Histórico do Git', estado: 'N/M', detalhe: ['varredura do histórico desligada (--sem-historico)'] });
  } else {
    const h = S.varrerHistorico();
    if (h.estado !== 'varrido') passos.push({ nome: 'Histórico do Git', estado: 'N/M', detalhe: [h.motivo] });
    else passos.push(passoPorProblemas('Histórico do Git', h.achados.map((a) => `${a.tipo} em ${a.arquivo}`), [`${h.linhasAdicionadas} linhas adicionadas varridas em todos os commits`]));
  }
  return passos;
}

function passoDeTestes(nome, arquivos) {
  const r = rodar(['--test', ...arquivos]);
  const resumo = lerResumoTestes(r.saida);
  const problemas = avaliarTestes(resumo, r.codigo);
  return passoPorProblemas(nome, problemas, [`${resumo.testes} testes em ${arquivos.length} arquivos`]);
}

function passoGitDiff() {
  const problemas = [];
  const detalhe = [];
  const feitos = [['git', ['diff', '--check']], ['git', ['diff', '--cached', '--check']]];
  const baseDoPr = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  const temBase = git(['rev-parse', '--verify', '--quiet', baseDoPr]).codigo === 0;
  if (temBase) feitos.push(['git', ['diff', '--check', `${baseDoPr}...HEAD`]]);
  for (const [, args] of feitos) {
    const r = git(args);
    if (r.codigo !== 0) problemas.push(`git ${args.join(' ')}: ${ultimas(r.saida, 3).join(' | ')}`);
  }
  if (!temBase) return { nome: 'git diff', estado: problemas.length ? 'FAIL' : 'WARN', detalhe: problemas.length ? problemas : [`sem ${baseDoPr}: conferi só as mudanças locais, não a diferença para a base`] };
  return passoPorProblemas('git diff', problemas, [`espaços e marcas de conflito conferidos contra ${baseDoPr}`]);
}

function passoMutacao(pedida) {
  if (!pedida) return { nome: 'Mutação', estado: 'N/M', detalhe: ['não pedida nesta execução (use --mutacao; leva alguns minutos). Último resultado completo: docs/gate/MUTACOES.md'] };
  const r = rodar(['scripts/mutacoes.js']);
  const resumo = (r.saida.match(/\d+\/\d+ mutações detectadas\./) || ['sem resumo'])[0];
  const vivas = r.saida.split('\n').filter((l) => /SOBREVIVEU/.test(l));
  return r.codigo === 0 ? { nome: 'Mutação', estado: 'PASS', detalhe: [resumo] } : { nome: 'Mutação', estado: 'FAIL', detalhe: [resumo].concat(vivas.slice(0, 10)) };
}

function principal(args) {
  const estrito = args.includes('--estrito');
  const passos = [passoAmbiente(), passoEstrutura()];
  const testes = passoTestes();
  passos.push(testes);
  const cobertura = passoCobertura();
  passos.push(cobertura, passoCoberturaDocumentada(), passoProducao(), passoEscopos(), ...passosDeVarredura(!args.includes('--sem-historico')));
  passos.push(passoDeTestes('Integridade', TESTES_DE_INTEGRIDADE), passoDeTestes('Documentos', TESTES_DE_DOCUMENTOS), passoGitDiff(), passoMutacao(args.includes('--mutacao')));
  const texto = formatarRelatorio(passos, estrito);
  console.log(texto);
  process.exit(resultadoFinal(passos, estrito).codigo);
}

if (require.main === module) principal(process.argv.slice(2));
module.exports = {
  MINIMO_NODE_MAJOR, MINIMO_TESTES, ARQUIVOS_OBRIGATORIOS, PROIBIDOS_NO_GIT, TESTES_DE_INTEGRIDADE, TESTES_DE_DOCUMENTOS,
  lerResumoTestes, avaliarTestes, avaliarVersaoNode, resultadoFinal, formatarRelatorio, passoPorProblemas, problemasDeEstrutura,
  passoAmbiente, passoEstrutura, passoProducao, passoEscopos, passosDeVarredura, passoGitDiff, passoMutacao,
};
