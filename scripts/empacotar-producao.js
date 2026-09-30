// Monta o pacote de PRODUÇÃO do Kit do Consultório em dist/producao/ (fora do Git).
// O pacote de teste é a própria pasta src/ (é o que o clasp envia ao projeto de TESTE).
// O de produção NÃO leva o gerador de dados fictícios nem a permissão de escrever na agenda, que só o gerador usa.
// Uso: node scripts/empacotar-producao.js
// Este script só monta arquivos. Não usa clasp, não envia nada ao Google e não lê dado de paciente.
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const PASTA_SRC = path.join(RAIZ, 'src');
const PASTA_SAIDA = path.join(RAIZ, 'dist', 'producao');

// Arquivos que só existem para a conta de TESTE (T04).
const ARQUIVOS_SOMENTE_TESTE = ['DadosTeste.js', 'GeradorTeste.js'];

// Escopo de teste -> escopo que a produção usa no lugar. Criar e apagar eventos fictícios exige escrever
// na agenda; ler os eventos (sincronização, T05) só exige leitura. Ver D23 em docs/DECISOES.md.
const ESCOPO_AGENDA_TESTE = 'https://www.googleapis.com/auth/calendar.events';
const ESCOPO_AGENDA_PRODUCAO = 'https://www.googleapis.com/auth/calendar.events.readonly';
const SUBSTITUICAO_DE_ESCOPOS = { [ESCOPO_AGENDA_TESTE]: ESCOPO_AGENDA_PRODUCAO };

// Escopos que a produção pode ter, nem mais nem menos (cada um justificado em docs/DECISOES.md).
const ESCOPOS_DE_PRODUCAO = [
  'https://www.googleapis.com/auth/spreadsheets.currentonly',
  'https://www.googleapis.com/auth/script.send_mail',
  ESCOPO_AGENDA_PRODUCAO,
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
];

// Nomes de nível de cima (const, let, var, function, class) definidos no texto de um arquivo.
function nomesGlobais(texto) {
  return [...texto.matchAll(/^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
}

// Único uso permitido de um nome de teste fora dos arquivos de teste: o gancho opcional do menu, sempre
// protegido por `typeof` (Menu.js). Sem o arquivo de teste, o `if` é falso e o submenu de teste não aparece.
const GANCHO_OPCIONAL_DO_MENU = /if \(typeof (\w+) === 'function'\) \1\(ui, menu\);/g;

// Marcas que denunciam dado ou ferramenta de teste, mesmo fora dos arquivos de teste.
const MARCAS_DE_TESTE = [
  /Calendar\.Events\.(insert|update|patch|remove|delete|import|move|quickAdd)\b/, // escrita na agenda
  /\bP9\d{3}\b/, // códigos de paciente reservados para teste
  /exemplo\.invalid/, // e-mails inventados
  /kit_?teste/i, // marca dos eventos de teste e prefixo dos ids
  /dados? (fictício|de teste)/i,
];

// Lê src/ e devolve o pacote em memória: { arquivos: [{ nome, conteudo }], manifesto, excluidos }.
function montarPacoteProducao(pastaSrc = PASTA_SRC) {
  const todos = fs.readdirSync(pastaSrc).filter((a) => a.endsWith('.js')).sort();
  const excluidos = todos.filter((a) => ARQUIVOS_SOMENTE_TESTE.includes(a));
  const arquivos = todos.filter((a) => !excluidos.includes(a))
    .map((nome) => ({ nome, conteudo: fs.readFileSync(path.join(pastaSrc, nome), 'utf8') }));
  const manifesto = JSON.parse(fs.readFileSync(path.join(pastaSrc, 'appsscript.json'), 'utf8'));
  manifesto.oauthScopes = manifesto.oauthScopes.map((e) => SUBSTITUICAO_DE_ESCOPOS[e] || e);
  const nomesExcluidos = excluidos.flatMap((a) => nomesGlobais(fs.readFileSync(path.join(pastaSrc, a), 'utf8')));
  return { arquivos, manifesto, excluidos, nomesExcluidos };
}

// Confere o pacote e devolve a lista de problemas em português (vazia = pacote limpo).
function verificarPacoteProducao(pacote) {
  const problemas = [];
  for (const a of pacote.arquivos) {
    if (ARQUIVOS_SOMENTE_TESTE.includes(a.nome)) problemas.push(`O pacote de produção leva o arquivo de teste ${a.nome}.`);
    const semGancho = a.conteudo.replace(GANCHO_OPCIONAL_DO_MENU, '');
    for (const nome of pacote.nomesExcluidos) {
      if (new RegExp(`(?<![\\w$])${nome.replace(/\$/g, '\\$')}(?![\\w$])`).test(semGancho)) {
        problemas.push(`${a.nome} usa "${nome}", que só existe nos arquivos de teste.`);
      }
    }
    for (const marca of MARCAS_DE_TESTE) {
      if (marca.test(a.conteudo)) problemas.push(`${a.nome} tem marca de teste (${marca}).`);
    }
  }
  const escopos = pacote.manifesto.oauthScopes || [];
  for (const e of escopos) if (!ESCOPOS_DE_PRODUCAO.includes(e)) problemas.push(`Escopo fora da lista de produção: ${e}`);
  for (const e of ESCOPOS_DE_PRODUCAO) if (!escopos.includes(e)) problemas.push(`Falta o escopo de produção: ${e}`);
  if (escopos.includes(ESCOPO_AGENDA_TESTE)) problemas.push('O pacote de produção tem permissão para escrever na agenda (calendar.events).');
  if (pacote.manifesto.timeZone !== 'America/Sao_Paulo') problemas.push('Fuso horário do manifesto não é America/Sao_Paulo.');
  return problemas;
}

// Grava o pacote em dist/producao/, apagando o que havia lá. Recusa qualquer pasta fora de dist/.
function escreverPacote(pacote, pastaSaida = PASTA_SAIDA) {
  const destino = path.resolve(pastaSaida);
  if (!destino.startsWith(path.join(RAIZ, 'dist') + path.sep)) throw new Error('A saída do pacote precisa ficar dentro de dist/.');
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  for (const a of pacote.arquivos) fs.writeFileSync(path.join(destino, a.nome), a.conteudo);
  fs.writeFileSync(path.join(destino, 'appsscript.json'), `${JSON.stringify(pacote.manifesto, null, 2)}\n`);
  return destino;
}

if (require.main === module) {
  const pacote = montarPacoteProducao();
  const problemas = verificarPacoteProducao(pacote);
  if (problemas.length > 0) {
    console.error(`Pacote de produção RECUSADO:\n- ${problemas.join('\n- ')}`);
    process.exit(1);
  }
  const destino = escreverPacote(pacote);
  console.log(`Pacote de produção montado em ${path.relative(RAIZ, destino)}/ (${pacote.arquivos.length} arquivos).`);
  console.log(`Ficaram de fora: ${pacote.excluidos.join(', ')}.`);
  console.log('Nada foi enviado ao Google. O envio (clasp push) continua exigindo a confirmação do Caio.');
}

module.exports = {
  ARQUIVOS_SOMENTE_TESTE, ESCOPOS_DE_PRODUCAO, ESCOPO_AGENDA_TESTE, ESCOPO_AGENDA_PRODUCAO, MARCAS_DE_TESTE,
  nomesGlobais, montarPacoteProducao, verificarPacoteProducao, escreverPacote,
};
