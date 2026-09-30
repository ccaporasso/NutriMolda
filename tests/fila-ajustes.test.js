// T22 (esqueleto): fila de ajustes. Tabela e pedidos inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/FilaAjustes.js');

const tabela = [
  { alimento: 'Pão francês', troca: 'EXEMPLO INVENTADO: 1 pão francês = 2 fatias de pão integral' },
  { alimento: 'Arroz branco', troca: 'EXEMPLO INVENTADO: 4 colheres de arroz = 3 colheres de arroz integral' },
];
const novo = (extra = {}) => F.criarPedidoAjuste({ id: 'AJ0001', codigoPaciente: 'P9001', tipo: 'troca_alimento', termo: 'pao frances', criadoEm: '2026-09-30 09:00:00', ...extra }, tabela);

test('busca só por igualdade (sem acento, sem maiúscula); parecido ou ausente não devolve nada', () => {
  assert.equal(F.buscarNaTabela(tabela, 'PÃO FRANCÊS').trecho, tabela[0].troca);
  assert.equal(F.buscarNaTabela(tabela, 'pao'), null);
  assert.equal(F.buscarNaTabela(tabela, 'arroz'), null);
  assert.equal(F.buscarNaTabela(tabela, ''), null);
  assert.equal(F.buscarNaTabela([...tabela, { alimento: 'pao frances', troca: 'outra' }], 'pao frances'), null); // duas linhas: ambíguo
});

test('pedido entra como pendente, com o trecho exato da tabela quando existe', () => {
  const p = novo();
  assert.equal(p.estado, 'pendente');
  assert.equal(p.sugestao.trecho, tabela[0].troca);
  assert.equal(F.textoParaEnviarAoPaciente(p), null); // pendente: nada sai
  assert.equal(novo({ termo: 'quinoa' }).sugestao, null);
  assert.equal(novo({ tipo: 'outro' }).sugestao, null);
});

test('pedido recusa id, código e tipo inválidos', () => {
  assert.throws(() => novo({ id: '1' }), /Identificador/);
  assert.throws(() => novo({ codigoPaciente: 'Ana' }), /Código/);
  assert.throws(() => novo({ tipo: 'receita' }), /Tipo/);
});

test('um toque aprova o trecho da tabela; só então há texto para o paciente', () => {
  const r = F.aprovarAjuste(novo(), { agoraTexto: '2026-09-30 10:00:00' });
  assert.equal(r.ok, true);
  assert.equal(r.pedido.toques, 1);
  assert.equal(F.textoParaEnviarAoPaciente(r.pedido), tabela[0].troca);
});

test('dois toques: ela edita o texto e aprova; o texto dela é o que vale', () => {
  const r = F.aprovarAjuste(novo(), { textoEditado: '  Pode trocar por 2 fatias de pão integral.  ', agoraTexto: '2026-09-30 10:00:00' });
  assert.equal(r.pedido.toques, 2);
  assert.equal(F.textoParaEnviarAoPaciente(r.pedido), 'Pode trocar por 2 fatias de pão integral.');
});

test('sem trecho na tabela e sem texto dela, não aprova: nada é inventado', () => {
  const r = F.aprovarAjuste(novo({ termo: 'quinoa' }), { agoraTexto: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Escreva o texto/);
  assert.equal(F.aprovarAjuste(novo({ termo: 'quinoa' }), { textoEditado: '   ', agoraTexto: 'x' }).ok, false);
  assert.equal(F.aprovarAjuste(novo({ termo: 'quinoa' }), { textoEditado: 'Use 3 colheres de quinoa.', agoraTexto: 'x' }).ok, true);
});

test('recusado ou já decidido nunca sai para o paciente nem é decidido de novo', () => {
  const rec = F.recusarAjuste(novo(), { agoraTexto: 'x' }).pedido;
  assert.equal(rec.estado, 'recusado');
  assert.equal(F.textoParaEnviarAoPaciente(rec), null);
  assert.equal(F.aprovarAjuste(rec, { textoEditado: 'oi', agoraTexto: 'x' }).ok, false);
  const apr = F.aprovarAjuste(novo(), { agoraTexto: 'x' }).pedido;
  assert.equal(F.recusarAjuste(apr, { agoraTexto: 'y' }).ok, false);
  // adulterar o estado à mão sem texto aprovado não libera o envio
  assert.equal(F.textoParaEnviarAoPaciente({ ...novo(), estado: 'aprovado' }), null);
});

test('troca ausente, vazia, só com espaços ou que não é texto nunca vira sugestão nem texto aprovado', () => {
  for (const troca of [undefined, null, '', '   ', 42, {}]) {
    const t = [{ alimento: 'Pão francês', troca }];
    assert.equal(F.buscarNaTabela(t, 'pao frances'), null, String(troca));
    const pedido = F.criarPedidoAjuste({ id: 'AJ0001', codigoPaciente: 'P9001', tipo: 'troca_alimento', termo: 'pão francês', criadoEm: 'x' }, t);
    assert.equal(pedido.sugestao, null);
    assert.equal(F.aprovarAjuste(pedido, { agoraTexto: 'x' }).ok, false);
    assert.equal(F.aprovarAjuste(pedido, { textoEditado: '   ', agoraTexto: 'x' }).ok, false);
  }
  // sugestão malformada montada à mão também não aprova nem sai
  const mal = { ...novo(), sugestao: { alimento: 'x', trecho: undefined } };
  assert.equal(F.aprovarAjuste(mal, { agoraTexto: 'x' }).ok, false);
  assert.equal(F.textoParaEnviarAoPaciente({ ...novo(), estado: 'aprovado', texto_final: undefined }), null);
  assert.equal(F.textoParaEnviarAoPaciente({ ...novo(), estado: 'aprovado', texto_final: '   ' }), null);
  // texto editado por ela continua valendo mesmo sem sugestão
  assert.equal(F.aprovarAjuste(mal, { textoEditado: 'Troque por 2 fatias.', agoraTexto: 'x' }).ok, true);
});

test('fila: pendentes primeiro, do mais antigo ao mais novo', () => {
  const a = novo({ id: 'AJ0001', criadoEm: '2026-09-30 09:00:00' });
  const b = novo({ id: 'AJ0002', criadoEm: '2026-09-29 09:00:00' });
  const c = F.aprovarAjuste(novo({ id: 'AJ0003', criadoEm: '2026-09-28 09:00:00' }), { agoraTexto: 'x' }).pedido;
  assert.deepEqual(F.ordenarFila([a, c, b]).map((p) => p.id), ['AJ0002', 'AJ0001', 'AJ0003']);
});
