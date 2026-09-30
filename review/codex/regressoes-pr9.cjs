const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const R = require(path.join(process.cwd(), 'scripts/revisao.js'));
function resposta(parecer, problemas) {
  return `# Revisão T05\n\n## Parecer\n${parecer}\n\n## Resumo\nResumo fictício.\n\n## Problemas\n${problemas}\n\n## Testes\nTeste local.\n\n## Pontos para validar no Google\nNenhum.\n`;
}
test('N9-01: aprovado com ressalvas e ALTA deve impedir a aprovação', () => {
  const r = R.lerResposta(resposta('APROVADO COM RESSALVAS', '### P1 [ALTA] src/Agenda.js, planejarSincronizacaoAgenda\n- Trecho: `exemplo`\n- Problema: falha fictícia.\n- Correção esperada: corrigir.'));
  assert.equal(r.valida, false);
});
test('N9-02: parecer negado não pode ser aceito como aprovado', () => {
  const r = R.lerResposta(resposta('NÃO APROVADO', 'Nenhum.'));
  assert.equal(r.valida, false);
});
