#!/usr/bin/env node
// Ciclo de revisão: gera o pacote para colar no ChatGPT e confere a resposta dele.
// Só Node, sem dependência. Uso: node scripts/revisao.js ajuda
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const PASTA_PACOTES = path.join(RAIZ, '.revisao');
const PASTA_RESPOSTAS = path.join(RAIZ, 'docs', 'revisoes');
const LIMITE_DIFF = 150000; // caracteres; acima disso o ChatGPT costuma cortar
const LIMITE_TESTES = 6000;

const PARECERES = ['APROVADO', 'APROVADO COM RESSALVAS', 'REPROVADO'];
const PRIORIDADES = ['ALTA', 'MÉDIA', 'BAIXA'];

// ---------- lógica pura (testada em tests/revisao.test.js) ----------

function idValido(id) {
  return typeof id === 'string' && /^[A-Za-z]\d{1,3}$/.test(id);
}

// Acha a linha da tabela de TAREFAS.md que começa com "| T05 |".
function extrairLinhaTarefa(md, id) {
  const alvo = String(id).toUpperCase();
  for (const linha of String(md).split('\n')) {
    const m = linha.match(/^\|\s*([A-Za-z]\d{1,3})\s*\|/);
    if (m && m[1].toUpperCase() === alvo) return linha.trim();
  }
  return null;
}

// Linhas da tabela de DECISOES.md para os códigos D17, D20 etc. citados.
function extrairDecisoes(md, textoQueCita) {
  const ids = [...new Set(String(textoQueCita).match(/\bD\d{1,3}\b/g) || [])];
  const achadas = [];
  for (const id of ids) {
    const linha = String(md).split('\n').find((l) => l.startsWith(`| ${id} |`));
    if (linha) achadas.push(linha.trim());
  }
  return achadas.sort((a, b) => Number(a.match(/D(\d+)/)[1]) - Number(b.match(/D(\d+)/)[1]));
}

// Entre "hash assunto" por linha, devolve o commit cujo assunto começa com "T05:".
function acharCommit(linhasLog, id) {
  const alvo = String(id).toUpperCase();
  for (const linha of linhasLog) {
    const [hash, ...resto] = linha.split(' ');
    const assunto = resto.join(' ').trim().toUpperCase();
    if (hash && (assunto.startsWith(`${alvo}:`) || assunto.startsWith(`${alvo} `))) return hash;
  }
  return null;
}

// Só as linhas adicionadas pelo diff que parecem dado pessoal real.
// Dados inventados do kit (e-mails @example, telefones 11 9xxxx-xxxx de teste) também podem
// aparecer: por isso é um AVISO para o Caio conferir, não um bloqueio.
function varrerDados(diff) {
  const padroes = [
    ['CPF', /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/],
    ['e-mail', /\b[\w.+-]+@(?!example\.|exemplo\.|teste\.|group\.calendar\.google\.com)[\w-]+\.[\w.-]+\b/i],
    ['telefone', /\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/],
  ];
  const achados = [];
  let arquivo = '';
  for (const linha of String(diff).split('\n')) {
    const cab = linha.match(/^\+\+\+ b\/(.+)$/);
    if (cab) { arquivo = cab[1]; continue; }
    if (!linha.startsWith('+') || linha.startsWith('+++')) continue;
    for (const [tipo, regex] of padroes) {
      if (regex.test(linha)) achados.push({ arquivo, tipo });
    }
  }
  // Só o resumo por arquivo e tipo: o valor achado não é repetido em lugar nenhum.
  const resumo = new Map();
  for (const a of achados) {
    const chave = `${a.arquivo}|${a.tipo}`;
    resumo.set(chave, (resumo.get(chave) || 0) + 1);
  }
  return [...resumo].map(([chave, quantas]) => {
    const [arquivo, tipo] = chave.split('|');
    return { arquivo, tipo, quantas };
  });
}

function cortar(texto, limite) {
  const t = String(texto);
  if (t.length <= limite) return t;
  return `[... início cortado, ${t.length - limite} caracteres ...]\n${t.slice(-limite)}`;
}

function cerca(texto, lang = '') {
  const s = String(texto);
  let barras = '```';
  while (s.includes(barras)) barras += '`';
  return `${barras}${lang}\n${s.replace(/\n+$/, '')}\n${barras}`;
}

const MODELO_RESPOSTA = `# Revisão {ID}

## Parecer
APROVADO | APROVADO COM RESSALVAS | REPROVADO   (escolha só um)

## Resumo
Duas ou três frases.

## Problemas
### P1 [ALTA] caminho/do/arquivo.js, nomeDaFuncao
- Trecho: \`o trecho de código que você está criticando, copiado do pacote\`
- Problema: o que está errado e qual o efeito.
- Correção esperada: o que deve mudar.

(Repita P2, P3... Prioridades: ALTA, MÉDIA ou BAIXA. Se não houver problema, escreva "Nenhum.")

## Testes
O que você rodou ou conferiu e o resultado. Se não conseguiu rodar nada, escreva "Não rodei" e diga o que leu.

## Pontos para validar no Google
O que só dá para confirmar na planilha e na agenda de TESTE. Se não houver, escreva "Nenhum."
`;

function montarRoteiro(id) {
  return `Você é o revisor de código de um projeto de Google Apps Script chamado Kit do Consultório (automações para uma nutricionista, instaladas na conta Google dela). Outro assistente escreveu o código; a sua tarefa é revisar e testar, e a decisão final é do Caio, que não programa: escreva de forma clara, sem jargão.

Abaixo do roteiro está o pacote: a tarefa e seus critérios de aceite, decisões que valem para ela, o diff, o resultado de \`node --test\` rodado antes do envio e um aviso automático sobre dados pessoais. Revise **a tarefa ${id}**.

## O que conferir, nesta ordem
1. A tarefa faz o que os critérios de aceite pedem? Falta algo? Há algo a mais que ninguém pediu?
2. Erros de lógica: datas e fuso (America/Sao_Paulo), valores em centavos (inteiros), rodar duas vezes duplica algo (tudo deve ser idempotente), casos de borda (vazio, texto no lugar de número, acentos, linhas em branco).
3. Diferenças entre o Google simulado dos testes e o Google de verdade (SpreadsheetApp, CalendarApp, DocumentApp, DriveApp, MailApp): aponte o que os testes não provam.
4. Regras que nunca mudam: (a) nenhum dado real de paciente em teste, exemplo, log ou commit; (b) nenhum servidor próprio nem web app público; (c) nenhuma automação não oficial do WhatsApp; (d) a IA nunca escreve ao paciente; (e) escopos de permissão mínimos, cada um justificado em docs/DECISOES.md; (f) nenhum dado de saúde em registro, e-mail de alerta ou nome de arquivo (só o código do paciente); (g) nenhuma dependência nova.
5. Os testes: cobrem o que importa? Há teste que passa por engano?
6. Código: nomes em português, funções pequenas, lógica pura separada das chamadas ao Google, mensagens de erro claras para a nutricionista.

## Como trabalhar
- Se você consegue executar código, rode \`node --test\` no repositório e conte o resultado. Se não consegue, leia o código e os testes e diga isso na seção Testes. Não invente resultado.
- Só aponte problema que você consegue justificar pelo pacote. Se estiver em dúvida, diga que é dúvida.
- Cite sempre o arquivo, a função e copie o trecho de código; número de linha só se você tiver certeza.
- Não reescreva o projeto e não sugira dependência nova.

## Formato da resposta (obrigatório, para ser lido por script)
Responda **só** neste modelo, em Markdown, sem texto antes nem depois:

${cerca(MODELO_RESPOSTA.replace('{ID}', id), 'markdown')}
`;
}

function montarPacote({ id, commit, base, linhaTarefa, decisoes, diff, estatisticas, testes, avisos, geradoEm }) {
  const partes = [];
  partes.push(`# Pacote de revisão ${id}`);
  partes.push(`Gerado em ${geradoEm}. Comparação: ${commit ? `commit ${commit}` : `branch atual contra ${base}`}.`);
  partes.push('---\n\n# PARTE 1: ROTEIRO PARA O REVISOR\n');
  partes.push(montarRoteiro(id));
  partes.push('---\n\n# PARTE 2: MATERIAL\n');
  partes.push('## Aviso automático sobre dados pessoais');
  partes.push(avisos.length
    ? `Atenção, Caio: antes de colar isto no ChatGPT, confira estes pontos (o valor não é repetido aqui). Se forem dados inventados de teste, tudo bem; se forem reais, **não envie**.\n${avisos.map((a) => `- ${a.arquivo}: ${a.quantas} linha(s) com padrão de ${a.tipo}`).join('\n')}`
    : 'Nenhum padrão de CPF, e-mail ou telefone fora dos exemplos fictícios foi encontrado nas linhas adicionadas.');
  partes.push('## Tarefa e critérios de aceite (docs/TAREFAS.md)');
  partes.push(linhaTarefa ? cerca(linhaTarefa) : `A tarefa ${id} não foi encontrada em docs/TAREFAS.md.`);
  partes.push('## Decisões citadas (docs/DECISOES.md)');
  partes.push(decisoes.length ? cerca(decisoes.join('\n')) : 'Nenhuma decisão citada.');
  partes.push('## Resultado de `node --test` (rodado antes do envio)');
  partes.push(cerca(cortar(testes, LIMITE_TESTES)));
  partes.push('## Arquivos alterados');
  partes.push(cerca(estatisticas));
  partes.push('## Diff');
  partes.push(cerca(diff, 'diff'));
  return `${partes.join('\n\n')}\n`;
}

// Confere se a resposta do ChatGPT seguiu o formato e resume o que ela pede.
function lerResposta(texto) {
  const erros = [];
  const t = String(texto).replace(/\r\n/g, '\n');
  const secao = (nome) => {
    const m = t.match(new RegExp(`^##\\s+${nome}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi'));
    return m ? m[1].trim() : null;
  };
  const parecerBruto = secao('Parecer');
  let parecer = null;
  if (parecerBruto === null) erros.push('Falta a seção "## Parecer".');
  else {
    const maiusculo = parecerBruto.toUpperCase();
    // O mais específico primeiro: "APROVADO COM RESSALVAS" também contém "APROVADO".
    parecer = ['APROVADO COM RESSALVAS', 'REPROVADO', 'APROVADO'].find((p) => maiusculo.includes(p)) || null;
    if (!parecer) erros.push(`O parecer precisa ser um destes: ${PARECERES.join(', ')}.`);
    else if (parecerBruto.includes('|')) erros.push('O parecer traz as três opções; deixe só uma.');
  }
  const problemasBruto = secao('Problemas');
  const problemas = [];
  if (problemasBruto === null) erros.push('Falta a seção "## Problemas".');
  else {
    for (const m of problemasBruto.matchAll(/^###\s+(P\d+)\s*\[([^\]]+)\]\s*(.*)$/gmi)) {
      const prioridade = m[2].trim().toUpperCase().replace('MEDIA', 'MÉDIA');
      if (!PRIORIDADES.includes(prioridade)) erros.push(`${m[1]}: prioridade "${m[2]}" inválida (use ${PRIORIDADES.join(', ')}).`);
      problemas.push({ id: m[1].toUpperCase(), prioridade, onde: m[3].trim() });
    }
    const semProblema = /^\s*nenhum/i.test(problemasBruto);
    if (!problemas.length && !semProblema) erros.push('Nenhum problema no formato "### P1 [ALTA] arquivo, função" e a seção não diz "Nenhum".');
    if (semProblema && problemas.length) erros.push('A seção diz "Nenhum" mas lista problemas.');
  }
  if (secao('Testes') === null) erros.push('Falta a seção "## Testes".');
  if (secao('Pontos para validar no Google') === null) erros.push('Falta a seção "## Pontos para validar no Google".');
  if (parecer === 'APROVADO' && problemas.some((p) => p.prioridade === 'ALTA')) {
    erros.push('Parecer APROVADO, mas há problema de prioridade ALTA.');
  }
  if (parecer === 'REPROVADO' && !problemas.length) erros.push('Parecer REPROVADO, mas nenhum problema listado.');
  const contagem = { ALTA: 0, MÉDIA: 0, BAIXA: 0 };
  for (const p of problemas) if (p.prioridade in contagem) contagem[p.prioridade] += 1;
  return { valida: erros.length === 0, erros, parecer, problemas, contagem };
}

// Última resposta salva para a tarefa, pela data no nome (T05-2026-09-30.md, T05-2026-09-30-2.md).
function ultimaResposta(nomes, id) {
  const prefixo = `${String(id).toUpperCase()}-`;
  // Ordena por data e depois pelo número final (sem número = 1); "-2.md" vem depois de ".md".
  const chave = (n) => {
    const m = n.match(/(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.md$/);
    return m ? `${m[1]}#${String(m[2] || 1).padStart(4, '0')}` : '';
  };
  const candidatos = nomes.filter((n) => n.toUpperCase().startsWith(prefixo) && chave(n));
  return candidatos.sort((a, b) => chave(a).localeCompare(chave(b))).pop() || null;
}

function proximoNomeResposta(nomes, id, dataISO) {
  const base = `${String(id).toUpperCase()}-${dataISO}`;
  const usados = new Set(nomes);
  if (!usados.has(`${base}.md`)) return `${base}.md`;
  let n = 2;
  while (usados.has(`${base}-${n}.md`)) n += 1;
  return `${base}-${n}.md`;
}

// Comando da área de transferência por sistema: Mac (pbcopy/pbpaste), Windows (clip/PowerShell), Linux (xclip).
function comandoAreaDeTransferencia(plataforma, modo) {
  const tabela = {
    darwin: { copiar: ['pbcopy', []], colar: ['pbpaste', []] },
    win32: { copiar: ['clip', []], colar: ['powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw']] },
    linux: { copiar: ['xclip', ['-selection', 'clipboard']], colar: ['xclip', ['-selection', 'clipboard', '-o']] },
  };
  return (tabela[plataforma] || tabela.linux)[modo];
}

function copiarParaAreaDeTransferencia(texto) {
  const [cmd, args] = comandoAreaDeTransferencia(process.platform, 'copiar');
  const r = spawnSync(cmd, args, { input: texto, encoding: 'utf8' });
  return !r.error && r.status === 0;
}

function lerAreaDeTransferencia() {
  const [cmd, args] = comandoAreaDeTransferencia(process.platform, 'colar');
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error('Não consegui ler a área de transferência neste computador. Salve a resposta num arquivo e use --arquivo.');
  return r.stdout;
}

// ---------- ligação com git, arquivos e terminal ----------

function git(args) {
  return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function lerArquivo(rel) {
  try { return fs.readFileSync(path.join(RAIZ, rel), 'utf8'); } catch { return ''; }
}

function dataHoje() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function opcoes(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const nome = argv[i].slice(2);
      const proximo = argv[i + 1];
      if (proximo === undefined || proximo.startsWith('--')) o[nome] = true;
      else { o[nome] = proximo; i += 1; }
    } else o._.push(argv[i]);
  }
  return o;
}

function comandoPacote(o) {
  const id = String(o._[1] || '').toUpperCase();
  if (!idValido(id)) throw new Error('Diga o código da tarefa, por exemplo: node scripts/revisao.js pacote T05');
  const base = typeof o.base === 'string' ? o.base : 'origin/main';
  try { git(['rev-parse', '--verify', '--quiet', base]); } catch { throw new Error(`Não achei a base "${base}". Rode "git fetch origin" ou use --base outra-branch.`); }

  let commit = null;
  if (!o['branch-inteira']) {
    const log = git(['log', '--format=%h %s', `${base}..HEAD`]).split('\n').filter(Boolean);
    commit = acharCommit(log, id);
    if (!commit) console.error(`Aviso: nenhum commit "${id}:" entre ${base} e HEAD. Usando a branch inteira contra ${base}.`);
  }
  const alcance = commit ? [`${commit}^!`] : [`${base}...HEAD`];
  const diff = git(['diff', '-U8', ...alcance]);
  if (!diff.trim()) throw new Error('O diff está vazio: não há nada para revisar.');
  const estatisticas = git(['diff', '--stat', ...alcance]).trim();
  const mensagem = commit ? git(['log', '-1', '--format=%B', commit]) : '';

  const tarefas = lerArquivo('docs/TAREFAS.md');
  const linhaTarefa = extrairLinhaTarefa(tarefas, id);
  const decisoes = extrairDecisoes(lerArquivo('docs/DECISOES.md'), `${linhaTarefa || ''}\n${mensagem}\n${diff}`);

  let testes;
  if (o['sem-testes']) testes = 'Testes não rodados (--sem-testes).';
  else {
    const r = spawnSync(process.execPath, ['--test'], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const saida = `${r.stdout || ''}${r.stderr || ''}`;
    const resumo = saida.split('\n').filter((l) => /^# (tests|suites|pass|fail|cancelled|skipped|todo)\b/.test(l)).join('\n');
    // Rodou na branch atual (HEAD), não necessariamente no commit escolhido.
    testes = `Rodado na branch atual, código de saída ${r.status}.\n${r.status === 0 ? resumo : saida}`;
    if (r.status !== 0) console.error('Atenção: node --test FALHOU. Corrija antes de mandar para revisão.');
  }

  const avisos = varrerDados(diff);
  const pacote = montarPacote({ id, commit, base, linhaTarefa, decisoes, diff, estatisticas, testes, avisos, geradoEm: new Date().toISOString() });
  fs.mkdirSync(PASTA_PACOTES, { recursive: true });
  const destino = typeof o.saida === 'string' ? path.resolve(o.saida) : path.join(PASTA_PACOTES, `pacote-${id}.md`);
  fs.writeFileSync(destino, pacote);
  console.log(`Pacote gravado em: ${path.relative(RAIZ, destino) || destino} (${pacote.length} caracteres)`);
  if (diff.length > LIMITE_DIFF) console.log(`Atenção: o diff tem ${diff.length} caracteres; o ChatGPT pode cortar. Revise um commit por vez (um por tarefa) ou divida a revisão.`);
  if (avisos.length) console.log(`Atenção: ${avisos.length} ponto(s) parecem dado pessoal. Leia a seção "Aviso automático" do pacote antes de colar.`);
  if (o.copiar) {
    console.log(copiarParaAreaDeTransferencia(pacote)
      ? 'Pacote copiado: é só colar (Ctrl+V ou Cmd+V) no ChatGPT.'
      : 'Não consegui copiar sozinho neste computador; abra o arquivo e copie à mão.');
  }
  console.log('Próximo passo: abra o arquivo, copie tudo, cole no ChatGPT e salve a resposta com:\n  node scripts/revisao.js salvar ' + id + '   (cola o texto e termina com Ctrl+D)\n  ou crie o arquivo em docs/revisoes/ à mão.');
  return 0;
}

function comandoSalvar(o) {
  const id = String(o._[1] || '').toUpperCase();
  if (!idValido(id)) throw new Error('Diga o código da tarefa: node scripts/revisao.js salvar T05 < resposta.txt');
  const texto = typeof o.arquivo === 'string' ? fs.readFileSync(o.arquivo, 'utf8')
    : o.colar ? lerAreaDeTransferencia() : fs.readFileSync(0, 'utf8');
  if (!texto.trim()) throw new Error('Nenhum texto recebido.');
  fs.mkdirSync(PASTA_RESPOSTAS, { recursive: true });
  const nome = proximoNomeResposta(fs.readdirSync(PASTA_RESPOSTAS), id, dataHoje());
  fs.writeFileSync(path.join(PASTA_RESPOSTAS, nome), texto.endsWith('\n') ? texto : `${texto}\n`);
  console.log(`Salvo em docs/revisoes/${nome}`);
  return mostrarResumo(path.join(PASTA_RESPOSTAS, nome));
}

function mostrarResumo(arquivo) {
  const r = lerResposta(fs.readFileSync(arquivo, 'utf8'));
  console.log(`Parecer: ${r.parecer || '(não identificado)'}`);
  console.log(`Problemas: ${r.contagem.ALTA} alta, ${r.contagem['MÉDIA']} média, ${r.contagem.BAIXA} baixa`);
  for (const p of r.problemas) console.log(`  ${p.id} [${p.prioridade}] ${p.onde}`);
  if (!r.valida) {
    console.log('A resposta NÃO segue o formato:');
    for (const e of r.erros) console.log(`  - ${e}`);
    console.log('Peça ao ChatGPT para reenviar só no modelo do roteiro.');
    return 1;
  }
  console.log(`Formato ok. Peça ao Claude: "corrija a revisão em ${path.relative(RAIZ, arquivo)}".`);
  return 0;
}

function comandoConferir(o) {
  let alvo = o._[1];
  if (!alvo) throw new Error('Diga a tarefa ou o arquivo: node scripts/revisao.js conferir T05');
  if (idValido(String(alvo).toUpperCase()) && !String(alvo).endsWith('.md')) {
    const nome = ultimaResposta(fs.existsSync(PASTA_RESPOSTAS) ? fs.readdirSync(PASTA_RESPOSTAS) : [], alvo);
    if (!nome) throw new Error(`Nenhuma resposta salva para ${alvo} em docs/revisoes/.`);
    alvo = path.join(PASTA_RESPOSTAS, nome);
  }
  return mostrarResumo(path.resolve(alvo));
}

const AJUDA = `Ciclo de revisão do Kit do Consultório

  node scripts/revisao.js pacote T05      gera .revisao/pacote-T05.md para colar no ChatGPT
        --base origin/claude/desenvolvimento   compara com outra base (padrão: origin/main)
        --branch-inteira                       usa a branch toda, não só o commit "T05:"
        --sem-testes                           não roda node --test
        --saida arquivo.md                     grava em outro lugar
        --copiar                               já copia o pacote para colar no ChatGPT
  node scripts/revisao.js salvar T05      guarda a resposta colada (Ctrl+D) em docs/revisoes/ e confere o formato
        --colar                                lê a resposta que você acabou de copiar no ChatGPT
        --arquivo resposta.txt                 lê de um arquivo em vez do teclado
  node scripts/revisao.js conferir T05    confere a última resposta salva (ou um arquivo .md)
  node scripts/revisao.js modelo          mostra o modelo de resposta

Detalhes em docs/CICLO-REVISAO.md.`;

function principal(argv) {
  const o = opcoes(argv);
  const cmd = o._[0];
  try {
    if (cmd === 'pacote') return comandoPacote(o);
    if (cmd === 'salvar') return comandoSalvar(o);
    if (cmd === 'conferir') return comandoConferir(o);
    if (cmd === 'modelo') { console.log(MODELO_RESPOSTA.replace('{ID}', 'T05')); return 0; }
    console.log(AJUDA);
    return cmd && cmd !== 'ajuda' ? 1 : 0;
  } catch (erro) {
    console.error(`Erro: ${erro.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = principal(process.argv.slice(2));

module.exports = {
  idValido, extrairLinhaTarefa, extrairDecisoes, acharCommit, varrerDados, cortar, cerca,
  comandoAreaDeTransferencia, montarRoteiro, montarPacote, lerResposta, ultimaResposta, proximoNomeResposta, opcoes,
  MODELO_RESPOSTA,
};
