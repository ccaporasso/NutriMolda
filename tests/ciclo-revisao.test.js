// Testes do script do ciclo de revisão (scripts/revisao.js). Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../scripts/revisao.js');

const TAREFAS = [
  '| # | Tarefa | Dono |',
  '| T05 | Sincronização (D19) | Code | T02 | Não duplica | feita |',
  '| T06 | Pix | Code | T00 | CRC | feita |',
].join('\n');

test('extrairLinhaTarefa acha a linha e ignora o cabeçalho', () => {
  assert.match(r.extrairLinhaTarefa(TAREFAS, 't05'), /Sincronização/);
  assert.equal(r.extrairLinhaTarefa(TAREFAS, 'T99'), null);
});

test('extrairDecisoes devolve só as citadas, em ordem', () => {
  const md = '| D2 | dois |\n| D19 | dezenove |\n| D20 | vinte |';
  assert.deepEqual(r.extrairDecisoes(md, 'usa D20 e D2, também D77'), ['| D2 | dois |', '| D20 | vinte |']);
});

test('acharCommit pelo prefixo da tarefa', () => {
  const log = ['aaa1111 T06: pix', 'bbb2222 T05: sincronização', 'ccc3333 Lote 1: traz T05'];
  assert.equal(r.acharCommit(log, 'T05'), 'bbb2222');
  assert.equal(r.acharCommit(log, 'T50'), null);
});

test('varrerDados avisa CPF e e-mail fora dos exemplos, sem repetir o valor', () => {
  const diff = [
    '+++ b/src/A.js',
    '+const cpf = "123.456.789-09";',
    '+const ok = "paciente@example.com";',
    '+const real = "alguem@empresa.com.br";',
    '-const removida = "111.222.333-44";',
  ].join('\n');
  const achados = r.varrerDados(diff);
  assert.deepEqual(achados.map((a) => a.tipo).sort(), ['CPF', 'e-mail']);
  assert.ok(!JSON.stringify(achados).includes('123.456'));
});

test('cerca cresce quando o texto já tem cercas', () => {
  const c = r.cerca('a\n```\nb');
  assert.ok(c.startsWith('````'));
});

test('pacote traz roteiro, tarefa, testes e diff', () => {
  const p = r.montarPacote({
    id: 'T05', commit: 'bbb2222', base: 'origin/main', linhaTarefa: '| T05 | x |', decisoes: ['| D19 | y |'],
    diff: '+linha', estatisticas: ' 1 file changed', testes: '# pass 3', avisos: [], geradoEm: '2026-09-30T00:00:00Z',
  });
  for (const trecho of ['PARTE 1', 'tarefa T05', '| D19 | y |', '# pass 3', '+linha', '## Parecer', 'Nenhum padrão']) {
    assert.ok(p.includes(trecho), trecho);
  }
});

const RESPOSTA_OK = `# Revisão T05

## Parecer
APROVADO COM RESSALVAS

## Resumo
Está bom.

## Problemas
### P1 [MÉDIA] src/Agenda.js, janelaDeDatas
- Trecho: \`x\`
- Problema: y
- Correção esperada: z

### P2 [baixa] src/Formatos.js, formatarData
- Problema: w

## Testes
Não rodei; li o código.

## Pontos para validar no Google
Nenhum.
`;

test('lerResposta aceita resposta no formato e conta prioridades', () => {
  const x = r.lerResposta(RESPOSTA_OK);
  assert.equal(x.valida, true, x.erros.join('; '));
  assert.equal(x.parecer, 'APROVADO COM RESSALVAS');
  assert.deepEqual(x.contagem, { ALTA: 0, 'MÉDIA': 1, BAIXA: 1 });
});

test('lerResposta aceita "Nenhum." em Problemas', () => {
  const x = r.lerResposta(RESPOSTA_OK.replace(/## Problemas[\s\S]*?## Testes/, '## Problemas\nNenhum.\n\n## Testes').replace('APROVADO COM RESSALVAS', 'APROVADO'));
  assert.equal(x.valida, true, x.erros.join('; '));
});

test('lerResposta recusa formato errado', () => {
  assert.equal(r.lerResposta('Ficou ótimo!').valida, false);
  const doisPareceres = RESPOSTA_OK.replace('APROVADO COM RESSALVAS', 'APROVADO | REPROVADO');
  assert.equal(r.lerResposta(doisPareceres).valida, false);
  const prioridadeRuim = RESPOSTA_OK.replace('[MÉDIA]', '[URGENTE]');
  assert.match(r.lerResposta(prioridadeRuim).erros.join(' '), /prioridade/);
});

test('lerResposta recusa APROVADO com problema ALTA e REPROVADO sem problema', () => {
  const a = RESPOSTA_OK.replace('APROVADO COM RESSALVAS', 'APROVADO').replace('[MÉDIA]', '[ALTA]');
  assert.equal(r.lerResposta(a).valida, false);
  const b = RESPOSTA_OK.replace('APROVADO COM RESSALVAS', 'REPROVADO').replace(/## Problemas[\s\S]*?## Testes/, '## Problemas\nNenhum.\n\n## Testes');
  assert.equal(r.lerResposta(b).valida, false);
});

test('nomes de resposta: próximo e última', () => {
  const nomes = ['T05-2026-09-30.md', 'T05-2026-09-30-2.md', 'T06-2026-09-30.md', 'README.md'];
  assert.equal(r.proximoNomeResposta(nomes, 'T05', '2026-09-30'), 'T05-2026-09-30-3.md');
  assert.equal(r.proximoNomeResposta(nomes, 'T05', '2026-10-01'), 'T05-2026-10-01.md');
  assert.equal(r.ultimaResposta(nomes, 'T05'), 'T05-2026-09-30-2.md');
  assert.equal(r.ultimaResposta(nomes, 'T77'), null);
});

test('o modelo de resposta do roteiro é lido pelo próprio conferidor quando preenchido', () => {
  const modelo = r.MODELO_RESPOSTA.replace('{ID}', 'T05');
  // Como veio, com as três opções, deve ser recusado (é modelo, não resposta).
  assert.equal(r.lerResposta(modelo).valida, false);
});

test('comando da área de transferência por sistema', () => {
  assert.equal(r.comandoAreaDeTransferencia('darwin', 'copiar')[0], 'pbcopy');
  assert.equal(r.comandoAreaDeTransferencia('win32', 'copiar')[0], 'clip');
  assert.equal(r.comandoAreaDeTransferencia('linux', 'colar')[0], 'xclip');
  assert.equal(r.comandoAreaDeTransferencia('freebsd', 'colar')[0], 'xclip');
});

test('"NÃO APROVADO" e parecer com texto extra não viram APROVADO', () => {
  for (const ruim of ['NÃO APROVADO', 'Não aprovado', 'APROVADO, mas com dúvidas', 'REPROVADO ou APROVADO']) {
    const x = r.lerResposta(RESPOSTA_OK.replace('APROVADO COM RESSALVAS', ruim));
    assert.equal(x.valida, false, ruim);
    assert.equal(x.aprovada, false, ruim);
  }
  assert.equal(r.lerResposta(RESPOSTA_OK.replace('APROVADO COM RESSALVAS', '**Aprovado com ressalvas.**')).valida, true);
});

test('APROVADO COM RESSALVAS com problema ALTA é inválido e não aprova', () => {
  const x = r.lerResposta(RESPOSTA_OK.replace('[MÉDIA]', '[ALTA]'));
  assert.equal(x.valida, false);
  assert.equal(x.aprovada, false);
  assert.match(x.erros.join(' '), /ALTA/);
});

test('formato válido separa de aprovação técnica: REPROVADO é válido mas não aprovado', () => {
  const x = r.lerResposta(RESPOSTA_OK.replace('APROVADO COM RESSALVAS', 'REPROVADO').replace('[MÉDIA]', '[ALTA]'));
  assert.equal(x.valida, true, x.erros.join('; '));
  assert.equal(x.aprovada, false);
  assert.equal(r.lerResposta(RESPOSTA_OK).aprovada, true);
});
