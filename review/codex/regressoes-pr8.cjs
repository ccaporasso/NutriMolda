const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const raiz = process.cwd();
const R = require(path.join(raiz, 'src/Respostas.js'));
const F = require(path.join(raiz, 'src/FilaAjustes.js'));
test('N8-02: data inexistente não entra nas respostas', () => {
  const r = R.validarResposta({ dataHora:'2026-02-31 25:90:00', codigo:'P0001', resposta:'sim', nota:'' }, ['P0001']);
  assert.equal(r.ok, false);
});
test('N8-03: troca vazia ou ausente não produz aprovação nem texto undefined', () => {
  const pedido = F.criarPedidoAjuste({ id:'AJ0001', codigoPaciente:'P0001', tipo:'troca_alimento', termo:'Alimento ficticio', criadoEm:'2026-09-30 12:00:00' }, [{ alimento:'Alimento ficticio' }]);
  const r = F.aprovarAjuste(pedido, { agoraTexto:'2026-09-30 12:01:00' });
  assert.equal(r.ok, false, 'Sugestão sem texto foi aprovada');
});
