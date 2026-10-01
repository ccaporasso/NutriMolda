// Verificações de segurança locais do Gate de Continuidade. Sem dependências; não envia nada ao Google nem à rede.
// Uso: node scripts/seguranca.js [--historico]
// Três grupos separados, como pede o roteiro:
//   1) PII conhecida: e-mail com domínio real e número de 11 dígitos que não é exemplo fictício conhecido;
//   2) segredos: chaves, tokens, senhas e chaves privadas (por padrão, sem depender de lista de exemplos);
//   3) configuração: escopos, serviços do Google, registro de exceções e web app em `src/appsscript.json`.
// Nenhum achado imprime o valor encontrado (só arquivo, linha e tipo), para o relatório não vazar o que acusa.
// O histórico do Git só é lido com --historico e se o clone não for raso; senão fica "N/M".
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

// ---------- 1) PII conhecida ----------
const DOMINIOS_FICTICIOS = ['exemplo.invalid', 'exemplo.com', 'empresa.invalid', 'c.com', 'group.calendar.google.com'];
// Domínios reservados para documentação (RFC 2606) valem como fictícios.
const SUFIXOS_RESERVADOS = ['.invalid', '.test', '.example', 'example.com', 'example.org', 'example.net'];
// Valores fictícios exatos usados como amostra pelos próprios testes de varredura (nenhum é de pessoa real). A lista é de VALORES,
// não de pastas: um dado novo colado em qualquer arquivo continua sendo achado.
const LITERAIS_FICTICIOS = ['alguem@gmail.com', 'alguem@empresa.com.br', '111.222.333-44', '123e4567-e89b-12d3-a456-426614174000', '11144477735'];
const NUMEROS_FICTICIOS = ['52998224725', '52998224724', '11111111111', '12345678909', '12345678901', '00123456789', '11912345678', '55119000000', '11900000001'];

function varrerPII(texto, arquivo) {
  const achados = [];
  texto.split('\n').forEach((linha, i) => {
    for (const m of linha.matchAll(/[A-Za-z0-9._+-]+@([A-Za-z0-9.-]+\.[a-z]{2,})/g)) {
      const dominio = m[1].toLowerCase();
      const fictício = DOMINIOS_FICTICIOS.includes(dominio) || SUFIXOS_RESERVADOS.some((x) => dominio.endsWith(x)) || LITERAIS_FICTICIOS.includes(m[0].toLowerCase());
      if (!fictício) achados.push({ grupo: 'PII', tipo: 'e-mail com domínio real', arquivo, linha: i + 1 });
    }
    for (const m of linha.matchAll(/(?<!\d)\d{11}(?!\d)/g)) {
      if (!NUMEROS_FICTICIOS.includes(m[0]) && !LITERAIS_FICTICIOS.includes(m[0])) achados.push({ grupo: 'PII', tipo: 'número de 11 dígitos (CPF ou telefone) que não é exemplo conhecido', arquivo, linha: i + 1 });
    }
    // CPF no formato com pontos e traço
    for (const m of linha.matchAll(/(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g)) {
      if (!NUMEROS_FICTICIOS.includes(m[0].replace(/\D/g, '')) && !LITERAIS_FICTICIOS.includes(m[0])) achados.push({ grupo: 'PII', tipo: 'CPF formatado desconhecido', arquivo, linha: i + 1 });
    }
  });
  return achados;
}

// ---------- 2) segredos ----------
// Padrões montados por partes para este arquivo não casar com ele mesmo.
const P = (...partes) => new RegExp(partes.join(''));
const PADROES_SEGREDO = [
  ['chave privada', P('-----BEGIN ', '[A-Z ]*', 'PRIVATE KEY-----')],
  ['chave de acesso AWS', P('\\bAK', 'IA[0-9A-Z]{16}\\b')],
  ['chave de API do Google', P('\\bAI', 'za[0-9A-Za-z_-]{35}\\b')],
  ['segredo de cliente OAuth do Google', P('\\bGOC', 'SPX-[A-Za-z0-9_-]{20,}')],
  ['token de acesso do Google', P('\\bya', '29\\.[0-9A-Za-z_-]{30,}')],
  ['token do GitHub', P('\\bgh', '[pousr]_[A-Za-z0-9]{30,}')],
  ['token do Slack', P('\\bxo', 'x[abprs]-[A-Za-z0-9-]{10,}')],
  ['token JWT', P('\\bey', 'J[A-Za-z0-9_-]{10,}\\.ey', 'J[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}')],
  ['segredo ou senha atribuído em texto', /\b(api[_-]?key|client[_-]?secret|secret|token|passw(or)?d|senha)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
  ['URL com usuário e senha', /\bhttps?:\/\/[^\s:@/]+:[^\s@/]+@/i],
  // IDs reais de planilha, documento ou pasta do Google (44 ou 33 caracteres típicos) colados no código: só IDs fictícios de teste são aceitos.
  ['possível ID real de arquivo do Google (33 a 44 caracteres)', /(?<![A-Za-z0-9_-])1[A-Za-z0-9_-]{32,43}(?![A-Za-z0-9_-])/],
];

function varrerSegredos(texto, arquivo) {
  const achados = [];
  texto.split('\n').forEach((linha, i) => {
    const semUuid = linha.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ''); // UUID não é ID de arquivo do Google
    for (const [tipo, regex] of PADROES_SEGREDO) {
      if (regex.test(semUuid)) achados.push({ grupo: 'segredo', tipo, arquivo, linha: i + 1 });
    }
  });
  return achados;
}

// ---------- 3) configuração ----------
const ESCOPOS_PERMITIDOS = [
  'spreadsheets.currentonly', 'script.send_mail', 'calendar.events', 'calendar.events.readonly', 'script.scriptapp', 'documents', 'drive.file',
];
const SERVICOS_AVANCADOS_PERMITIDOS = ['calendar', 'drive'];
// Serviços do Google que o código pode usar. Um serviço novo (ou um escopo novo) faz o gate falhar até alguém:
// 1) acrescentar o nome aqui, 2) justificar em docs/DECISOES.md, 3) escrever o teste de uso (tests/revisao.test.js).
const SERVICOS_PERMITIDOS = ['SpreadsheetApp', 'DocumentApp', 'MailApp', 'ScriptApp', 'PropertiesService', 'LockService', 'Utilities', 'Calendar', 'Drive', 'Logger'];
const SERVICOS_CONHECIDOS_DO_GOOGLE = [
  'SpreadsheetApp', 'DocumentApp', 'SlidesApp', 'FormApp', 'DriveApp', 'CalendarApp', 'GmailApp', 'MailApp', 'ContactsApp', 'GroupsApp',
  'UrlFetchApp', 'HtmlService', 'ContentService', 'CacheService', 'PropertiesService', 'LockService', 'ScriptApp', 'Session', 'Utilities',
  'Calendar', 'Drive', 'Gmail', 'Sheets', 'Docs', 'Slides', 'People', 'AdminDirectory', 'BigQuery', 'JdbcService', 'XmlService', 'Charts', 'Maps', 'LanguageApp',
  'DataStudioApp', 'OAuth2', 'ScriptProperties', 'UserProperties', 'DocumentProperties', 'Logger',
];

function verificarConfiguracao(manifesto, textosDoSrc) {
  const achados = [];
  const falha = (tipo) => achados.push({ grupo: 'configuração', tipo, arquivo: 'src/appsscript.json', linha: 0 });
  for (const escopo of manifesto.oauthScopes || []) {
    const nome = String(escopo).split('/').pop();
    if (!ESCOPOS_PERMITIDOS.includes(nome)) falha(`escopo não previsto: ${nome}`);
    if (!String(escopo).startsWith('https://www.googleapis.com/auth/')) falha(`escopo fora do padrão: ${nome}`);
  }
  for (const s of (manifesto.dependencies && manifesto.dependencies.enabledAdvancedServices) || []) {
    if (!SERVICOS_AVANCADOS_PERMITIDOS.includes(s.serviceId)) falha(`serviço avançado não previsto: ${s.serviceId}`);
  }
  if (manifesto.webapp !== undefined) falha('web app declarado (endpoint público não autorizado, D35)');
  if (manifesto.executionApi !== undefined) falha('executionApi declarado');
  if (manifesto.runtimeVersion !== 'V8') falha('runtime diferente de V8');
  if (manifesto.timeZone !== 'America/Sao_Paulo') falha('fuso diferente de America/Sao_Paulo');
  if (!['STACKDRIVER', 'NONE'].includes(manifesto.exceptionLogging)) falha('exceptionLogging com valor desconhecido');
  if (Array.isArray(manifesto.libraries) && manifesto.libraries.length > 0) falha('biblioteca externa declarada (dependência nova exige decisão)');
  // Serviços usados no código
  const usados = new Set();
  const todos = Object.values(textosDoSrc).join('\n').replace(/\/\/.*$/gm, '');
  for (const nome of SERVICOS_CONHECIDOS_DO_GOOGLE) {
    if (new RegExp(`(?<![A-Za-z0-9_.$])${nome}\\.[A-Za-z]`).test(todos)) usados.add(nome);
  }
  for (const nome of usados) {
    if (!SERVICOS_PERMITIDOS.includes(nome)) achados.push({ grupo: 'configuração', tipo: `serviço do Google não previsto no código: ${nome}`, arquivo: 'src', linha: 0 });
  }
  return achados;
}

// ---------- arquivos e histórico ----------
function arquivosRastreados() {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: RAIZ, encoding: 'utf8' }); // rastreados e novos ainda não adicionados
  const texto = (f) => /\.(js|json|md|yml|yaml|txt|html|gs)$/i.test(f) || ['.gitignore'].includes(f);
  if (r.status === 0) return r.stdout.split('\n').filter(Boolean).filter(texto);
  // Sem git (cópia do projeto, por exemplo na mutação): percorre as pastas, fora de dist, node_modules e .git.
  const achados = [];
  const andar = (rel) => {
    for (const e of fs.readdirSync(path.join(RAIZ, rel), { withFileTypes: true })) {
      const caminho = path.posix.join(rel, e.name);
      if (['.git', 'dist', 'node_modules', '.revisao'].includes(e.name)) continue;
      if (e.isDirectory()) andar(caminho); else if (texto(caminho)) achados.push(caminho);
    }
  };
  andar('.');
  return achados.map((f) => f.replace(/^\.\//, ''));
}

function varrerArquivos() {
  const lista = arquivosRastreados();
  const achados = [];
  for (const f of lista || []) {
    const texto = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    achados.push(...varrerPII(texto, f), ...varrerSegredos(texto, f));
  }
  return { achados, arquivos: lista ? lista.length : 0, lista: Boolean(lista) };
}

// Linhas ADICIONADAS em todos os commits (git log -p). Metadados de autor não entram. Raso: N/M.
function varrerHistorico() {
  const raso = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: RAIZ, encoding: 'utf8' });
  if (raso.status !== 0) return { estado: 'N/M', motivo: 'git indisponível' };
  if (raso.stdout.trim() === 'true') return { estado: 'N/M', motivo: 'clone raso: o histórico completo não está disponível' };
  const r = spawnSync('git', ['log', '--all', '-p', '--no-color', '--format=COMMIT %h'], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) return { estado: 'N/M', motivo: 'falha ao ler o histórico' };
  const achados = [];
  let commit = '';
  let arquivo = '';
  let n = 0;
  for (const linha of r.stdout.split('\n')) {
    if (linha.startsWith('COMMIT ')) { commit = linha.slice(7); continue; }
    if (linha.startsWith('+++ ')) { arquivo = linha.slice(6); continue; }
    if (!linha.startsWith('+')) continue;
    n++;
    for (const a of [...varrerPII(linha.slice(1), `${arquivo}@${commit}`), ...varrerSegredos(linha.slice(1), `${arquivo}@${commit}`)]) achados.push({ ...a, linha: 0 });
  }
  return { estado: 'varrido', achados, linhasAdicionadas: n };
}

function executar(args = []) {
  const arquivos = varrerArquivos();
  const pii = arquivos.achados.filter((a) => a.grupo === 'PII');
  const segredos = arquivos.achados.filter((a) => a.grupo === 'segredo');
  const src = {};
  for (const f of fs.readdirSync(path.join(RAIZ, 'src')).filter((x) => x.endsWith('.js'))) src[f] = fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8');
  const config = verificarConfiguracao(JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'appsscript.json'), 'utf8')), src);
  const historico = args.includes('--historico') ? varrerHistorico() : { estado: 'N/M', motivo: 'não pedido (use --historico)' };
  const linhas = [];
  const mostrar = (nome, lista) => { linhas.push(`${nome.padEnd(22)} ${lista.length === 0 ? 'PASS' : `FALHA (${lista.length})`}`); for (const a of lista.slice(0, 20)) linhas.push(`   - ${a.tipo} em ${a.arquivo}${a.linha ? `:${a.linha}` : ''}`); };
  linhas.push(`Arquivos varridos (HEAD): ${arquivos.arquivos}${arquivos.lista ? '' : ' (git indisponível: N/M)'}`);
  mostrar('PII conhecida', pii);
  mostrar('Segredos', segredos);
  mostrar('Configuração', config);
  if (historico.estado === 'varrido') mostrar('Histórico do Git', historico.achados);
  else linhas.push(`${'Histórico do Git'.padEnd(22)} N/M (${historico.motivo})`);
  const ruim = pii.length + segredos.length + config.length + (historico.achados ? historico.achados.length : 0) > 0 || !arquivos.lista;
  return { ruim, texto: linhas.join('\n') };
}

if (require.main === module) {
  const r = executar(process.argv.slice(2));
  console.log(r.texto);
  process.exit(r.ruim ? 1 : 0);
}
module.exports = {
  varrerPII, varrerSegredos, verificarConfiguracao, varrerHistorico, varrerArquivos, executar,
  DOMINIOS_FICTICIOS, NUMEROS_FICTICIOS, LITERAIS_FICTICIOS, ESCOPOS_PERMITIDOS, SERVICOS_PERMITIDOS, SERVICOS_CONHECIDOS_DO_GOOGLE,
};
