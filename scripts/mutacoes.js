// Mutação manual controlada dos fluxos críticos (Gate C). Para cada mutação, copia o projeto para uma pasta temporária (apagada ao final),
// aplica UMA troca de texto em src/ ou scripts/ e roda a suíte inteira. A mutação precisa ser DETECTADA (a suíte falha);
// uma mutação que sobrevive é um buraco de teste. Nunca altera os arquivos reais. Sem dependências.
// Uso: node scripts/mutacoes.js [--escrever docs/gate/MUTACOES.md] [--so N]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
// Fora do projeto: dentro dele, `node --test` acharia as cópias dos testes e rodaria tudo em dobro.
const TRABALHO = path.join(os.tmpdir(), 'kit-mutacao');

// [id, arquivo, texto original (exatamente 1 ocorrência), texto mutado, descrição, teste que deveria detectar]
const MUTACOES = [
  ['M01', 'src/GeradorRecibo.js', "if (achados.situacao === 'um') {", 'if (false) {', 'recibo: remover a reconciliação por identidade (duplicar recibo)', 'recibo-idempotencia'],
  ['M02', 'src/GeradorRecibo.js', "if (!trava.tryLock(30000)) throw erroDeUso_('Outra operação está em andamento. Tente de novo em um minuto.');\n  let copia", 'let copia', 'recibo: remover o lock', 'recibo-idempotencia (concorrência)'],
  ['M03', 'src/GeradorRecibo.js', "'application/pdf', pdf, propriedadesDoRecibo(pagamento)).url", "'application/pdf', pdf).url", 'recibo: criar o PDF sem identidade gravada', 'recibo-idempotencia'],
  ['M04', 'src/Recibo.js', 'p[PROPRIEDADE_RECIBO_PAGAMENTO] === String(pagamento.id)', 'p[PROPRIEDADE_RECIBO_PAGAMENTO] !== undefined', 'recibo: religar PDF de OUTRO pagamento', 'recibo-idempotencia (identidade)'],
  ['M05', 'src/GeradorRecibo.js', "{ id: pagamento.id, codigo_paciente: pagamento.codigo_paciente });\n      registrar('recibo', 'info', `Recibo do pagamento", "undefined);\n      registrar('recibo', 'info', `Recibo do pagamento", 'recibo: gravar o link sem conferir a linha (atualizar linha errada)', 'recibo-idempotencia (linha mudou)'],
  ['M06', 'src/Recibo.js', 'if (pagamento.link_recibo) {', 'if (false) {', 'recibo: ignorar link já gravado (gerar de novo)', 'recibo / integracao'],
  ['M07', 'src/GeradorRecibo.js', '    driveMandarParaLixeira(idCopia);\n    return true;', '    return true;', 'recibo: deixar a cópia de trabalho (com nome e CPF) no Drive', 'falhas / recibo-idempotencia'],
  ['M08', 'src/Recibo.js', '!f.cpfValido(cpfBruto)', 'false', 'recibo: aceitar CPF inválido', 'recibo'],
  ['M09', 'src/Acoes.js', '!Number.isSafeInteger(pagamento.valor_centavos) || pagamento.valor_centavos <= 0', '!Number.isSafeInteger(pagamento.valor_centavos)', 'pagamento: permitir valor zero/negativo', 'invariantes-financeiros'],
  ['M10', 'src/Acoes.js', "if (pagamento.status !== 'a_receber') return recusa_(`O pagamento ${pagamento.id} não pode ser marcado como pago", 'if (false) return recusa_(`O pagamento ${pagamento.id} não pode ser marcado como pago', 'pagamento: pagar duas vezes (remover verificação de status)', 'invariantes-financeiros'],
  ['M11', 'src/Acoes.js', "if (pagamento.status !== 'a_receber') return recusa_(`O pagamento ${pagamento.id} não pode virar cortesia", 'if (false) return recusa_(`O pagamento ${pagamento.id} não pode virar cortesia', 'cortesia sobre pagamento já pago', 'invariantes-financeiros'],
  ['M12', 'src/Acoes.js', "valor_centavos: 0, data_pagamento: '' } };", "valor_centavos: pagamento.valor_centavos, data_pagamento: '' } };", 'cortesia com valor diferente de zero', 'invariantes-financeiros'],
  ['M13', 'src/Acoes.js', "status: 'pago', forma: 'pacote', valor_centavos: 0,", "status: 'pago', forma: 'pacote', valor_centavos: pagamento.valor_centavos,", 'pacote gera receita unitária fictícia', 'invariantes-financeiros'],
  ['M14', 'src/Acoes.js', 'if (p.usadas >= p.total_consultas) return semSaldo;', 'if (p.usadas > p.total_consultas) return semSaldo;', 'pacote: consumir além do total', 'invariantes-financeiros'],
  ['M15', 'src/Acoes.js', "|| consumidas[i] <= p.usadas) return p;\n    if (consumidas[i] > p.total_consultas) excedentes.push({ ...p, consumidas: consumidas[i] });\n    const alvo = Math.min(consumidas[i], p.total_consultas);\n    if (alvo <= p.usadas) return p;", ") return p;\n    const alvo = consumidas[i];", 'pacote: reconciliação diminui consumo e passa do total (as duas guardas removidas)', 'invariantes-financeiros'],
  ['M16', 'src/Acoes.js', 'const alvo = Math.min(consumidas[i], p.total_consultas);', 'const alvo = consumidas[i];', 'pacote: reconciliação passa do total', 'invariantes-financeiros'],
  ['M17', 'src/Menu.js', 'return comTrava_(() => {\n    const linhas = linhasSelecionadas', 'return ((f) => f())(() => {\n    const linhas = linhasSelecionadas', 'menu: remover o lock das ações em linhas (pacote, pagamento)', 'regressoes-revisao (R11b) / menu'],
  ['M18', 'src/LeitorAbas.js', 'if (String(atual) !== String(', 'if (false && String(atual) !== String(', 'planilha: gravar sem conferir a identidade da linha', 'agenda-adversa / regressoes-revisao'],
  ['M19', 'src/LeitorAbas.js', 'if (problema) throw erroDeUso_(problema);', '', 'planilha: não conferir o cabeçalho', 'regressoes-revisao (R07)'],
  ['M20', 'src/Pagamentos.js', 'if (idsComPagamento.has(id)) { contagens.jaTinham++; continue; }', 'if (false) { contagens.jaTinham++; continue; }', 'a receber: ignorar o id_evento (cobrar de novo)', 'pagamentos / operacoes-idempotentes'],
  ['M21', 'src/Pagamentos.js', 'maior = Math.max(maior, Number(m[1]));', 'maior = Number(m[1]);', 'ids de pagamento repetidos', 'invariantes-financeiros'],
  ['M22', 'src/Agenda.js', "if (c.status !== 'marcada') return; // realizada", 'if (false) return; // realizada', 'agenda: cancelar consulta já realizada', 'falhas / agenda'],
  ['M23', 'src/Agenda.js', 'if (idsConfirmados.has(id)) { repetidos++; continue; }', 'if (false) { repetidos++; continue; }', 'agenda: cancelar no evento contraditório', 'agenda-adversa'],
  ['M24', 'src/Agenda.js', 'if (idsJaProcessados.has(chaveDoItem)) { repetidos++; continue; }', 'if (false) { repetidos++; continue; }', 'agenda: id repetido gera duas consultas', 'agenda-adversa'],
  ['M25', 'src/Formatos.js', '(Z|[+-]\\d{2}:?\\d{2})$/.test(instanteIso)', '.*/.test(instanteIso)', 'fuso: aceitar instante sem fuso explícito', 'agenda-adversa'],
  ['M26', 'src/Relatorio.js', "if (p.status === 'cortesia' || p.forma === 'cortesia') { fora.cortesia++; continue; }", 'if (false) { fora.cortesia++; continue; }', 'relatório: contar cortesia como receita', 'invariantes-financeiros / relatorio'],
  ['M27', 'src/Relatorio.js', "if (p.forma === 'pacote') { fora.pacote++; continue; }", 'if (false) { fora.pacote++; continue; }', 'relatório: contar consulta de pacote como receita', 'invariantes-financeiros / relatorio'],
  ['M28', 'src/Relatorio.js', 'g.totalCentavos += p.valor_centavos;', 'g.totalCentavos += p.valor_centavos + 1;', 'relatório: total por pagador errado', 'invariantes-financeiros / relatorio'],
  ['M29', 'src/Relatorio.js', "return /^[=+\\-@]/.test(texto) ? ` ${texto}` : texto;", 'return texto;', 'CSV/planilha: fórmula injetada pelo nome do pagador', 'relatorio / seguranca-local'],
  ['M30', 'src/GerarRelatorio.js', 'return comTrava_(() => gerarRelatorioMensalComTrava_(mes));', 'return gerarRelatorioMensalComTrava_(mes);', 'relatório: remover o lock', 'relatorio-integridade'],
  ['M31', 'src/GeradorRecibo.js', "executarNoMenu_('recibo', () => comTrava_(() => {\n    const resultado", "executarNoMenu_('recibo', () => ((f) => f())(() => {\n    const resultado", 'modelo/pasta: remover o lock', 'modelo-pasta-idempotencia'],
  ['M32', 'src/GeradorRecibo.js', "let id = reaproveitarOuNada_(PAPEL_MODELO_RECIBO, 'modelos de recibo');", 'let id = null;', 'modelo: não reconciliar (criar segundo modelo)', 'modelo-pasta-idempotencia'],
  ['M33', 'src/GerarAReceber.js', "if (!trava.tryLock(30000)) throw erroDeUso_('Outra operação está em andamento. Tente de novo em um minuto.');", '', 'a receber: remover o lock', 'operacoes-idempotentes'],
  ['M34', 'src/SincronizarAgenda.js', "if (!trava.tryLock(30000)) throw erroDeUso_('Outra sincronização está em andamento. Tente de novo em um minuto.');", '', 'agenda: remover o lock', 'operacoes-idempotentes'],
  ['M35', 'src/SincronizarAgenda.js', "const jaTem = ScriptApp.getProjectTriggers().some((g) => g.getHandlerFunction() === NOME_GATILHO_SINCRONIZACAO);", 'const jaTem = false;', 'gatilho: criar um gatilho a cada vez', 'operacoes-idempotentes'],
  ['M36', 'src/Registro.js', ".replace(/[^\\s@]+@[^\\s@]+\\.[^\\s@]+/g, TEXTO_OCULTO)", '', 'registro: não mascarar e-mail', 'registro'],
  ['M37', 'src/Registro.js', 'return /^[=+\\-@]/.test(texto) ? ` ${texto}` : texto;', 'return texto;', 'registro: fórmula injetada na aba Registro', 'registro'],
  ['M38', 'src/Pix.js', '(crc << 1) ^ 0x1021', '(crc << 1) ^ 0x1020', 'Pix: polinômio do CRC errado', 'pix'],
  ['M39', 'scripts/empacotar-producao.js', 'const SUBSTITUICAO_DE_ESCOPOS = { [ESCOPO_AGENDA_TESTE]: ESCOPO_AGENDA_PRODUCAO };', 'const SUBSTITUICAO_DE_ESCOPOS = {};', 'produção: manter a escrita na agenda', 'producao'],
  ['M40', 'src/Acoes.js', "if (consulta.status === 'cancelada') return recusa_('Consulta cancelada", "if (false) return recusa_('Consulta cancelada", 'consulta cancelada marcada como realizada', 'falhas / menu'],
];

function copiarProjeto() {
  fs.rmSync(TRABALHO, { recursive: true, force: true });
  fs.mkdirSync(TRABALHO, { recursive: true });
  for (const item of fs.readdirSync(RAIZ)) {
    if (['.git', 'dist', 'node_modules', '.revisao'].includes(item)) continue;
    fs.cpSync(path.join(RAIZ, item), path.join(TRABALHO, item), { recursive: true });
  }
}

function rodarSuite() {
  const r = spawnSync(process.execPath, ['--test'], { cwd: TRABALHO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const falhas = [...(r.stdout || '').matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]);
  return { passou: r.status === 0, falhas };
}

function principal() {
  const args = process.argv.slice(2);
  const iso = args.indexOf('--so');
  const lista = iso >= 0 ? MUTACOES.filter((m) => m[0] === args[iso + 1]) : MUTACOES;
  copiarProjeto();
  const base = rodarSuite();
  if (!base.passou) { console.error('A suíte já falha SEM mutação; corrija antes de medir.'); process.exit(2); }
  const linhas = [];
  let sobreviveram = 0;
  for (const [id, arquivo, de, para, descricao, esperado] of lista) {
    const alvo = path.join(TRABALHO, arquivo);
    const original = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    const ocorrencias = original.split(de).length - 1;
    if (ocorrencias !== 1) { linhas.push({ id, descricao, esperado, resultado: `NÃO APLICÁVEL (${ocorrencias} ocorrências do texto)` }); sobreviveram++; continue; }
    fs.writeFileSync(alvo, original.replace(de, () => para));
    const r = rodarSuite();
    fs.writeFileSync(alvo, original);
    if (r.passou) sobreviveram++;
    linhas.push({ id, descricao, esperado, resultado: r.passou ? 'SOBREVIVEU' : `detectada (${r.falhas.length} teste(s) falharam)`, primeiro: r.falhas[0] });
    console.log(`${id} ${r.passou ? 'SOBREVIVEU ' : 'detectada  '} ${descricao}`);
  }
  const tabela = ['| Id | Mutação | Teste que deveria detectar | Detectou? |', '|---|---|---|---|']
    .concat(linhas.map((l) => `| ${l.id} | ${l.descricao} | ${l.esperado} | ${l.resultado}${l.primeiro ? `; ex.: "${l.primeiro.slice(0, 70)}"` : ''} |`)).join('\n');
  const i = args.indexOf('--escrever');
  if (i >= 0) fs.writeFileSync(path.resolve(RAIZ, args[i + 1]), `${tabela}\n`);
  fs.rmSync(TRABALHO, { recursive: true, force: true });
  console.log(`\n${lista.length - sobreviveram}/${lista.length} mutações detectadas.`);
  process.exit(sobreviveram > 0 ? 1 : 0);
}

if (require.main === module) principal();
module.exports = { MUTACOES };
