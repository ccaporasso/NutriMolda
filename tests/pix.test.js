// Confere o Pix copia e cola (T06). Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularCrc16, montarCampo, normalizarTextoPix, gerarPixCopiaECola } = require('../src/Pix.js');

const base = {
  chave: 'teste@exemplo.com', nome: 'Profissional de Teste', cidade: 'Sao Paulo',
  valorCentavos: 15050, idTransacao: 'P0001',
};

// Lê o texto como campos id+tamanho+valor; falha se os tamanhos não fecharem.
function lerCampos(texto) {
  const campos = {};
  let i = 0;
  while (i < texto.length) {
    const id = texto.slice(i, i + 2);
    const tam = Number(texto.slice(i + 2, i + 4));
    assert.ok(Number.isInteger(tam), 'tamanho inválido');
    const valor = texto.slice(i + 4, i + 4 + tam);
    assert.equal(valor.length, tam, 'campo cortado');
    campos[id] = valor;
    i += 4 + tam;
  }
  return campos;
}

test('CRC16-CCITT: vetor conhecido "123456789" dá 29B1', () => {
  assert.equal(calcularCrc16('123456789'), '29B1');
});

test('CRC sempre tem 4 letras maiúsculas (completa com zeros)', () => {
  for (const t of ['', 'a', 'teste', '0002016304']) assert.match(calcularCrc16(t), /^[0-9A-F]{4}$/);
});

test('montarCampo: id, tamanho com 2 dígitos e valor', () => {
  assert.equal(montarCampo('58', 'BR'), '5802BR');
  assert.equal(montarCampo('59', 'A'.repeat(9)), '5909AAAAAAAAA');
});

test('normalizarTextoPix: sem acento e em maiúsculas', () => {
  assert.equal(normalizarTextoPix('São José'), 'SAO JOSE');
});

test('gera todos os campos do padrão com os valores certos', () => {
  const texto = gerarPixCopiaECola(base);
  assert.ok(texto.startsWith('000201'));
  const c = lerCampos(texto);
  assert.equal(c['00'], '01');
  assert.deepEqual(lerCampos(c['26']), { '00': 'br.gov.bcb.pix', '01': 'teste@exemplo.com' });
  assert.equal(c['52'], '0000');
  assert.equal(c['53'], '986');
  assert.equal(c['54'], '150.50');
  assert.equal(c['58'], 'BR');
  assert.equal(c['59'], 'PROFISSIONAL DE TESTE');
  assert.equal(c['60'], 'SAO PAULO');
  assert.deepEqual(lerCampos(c['62']), { '05': 'P0001' });
  assert.equal(c['63'].length, 4);
});

test('o CRC do texto gerado confere', () => {
  const texto = gerarPixCopiaECola(base);
  const corpo = texto.slice(0, -4);
  assert.ok(corpo.endsWith('6304'));
  assert.equal(texto.slice(-4), calcularCrc16(corpo));
});

test('valor em centavos vira reais com ponto e duas casas', () => {
  const v = (n) => lerCampos(gerarPixCopiaECola({ ...base, valorCentavos: n }))['54'];
  assert.equal(v(1), '0.01');
  assert.equal(v(100), '1.00');
  assert.equal(v(25000), '250.00');
  assert.equal(v(123456), '1234.56');
});

test('sem identificador usa *** (padrão do Pix)', () => {
  const c = lerCampos(gerarPixCopiaECola({ ...base, idTransacao: undefined }));
  assert.deepEqual(lerCampos(c['62']), { '05': '***' });
});

test('nome e cidade com acento saem sem acento; limites 25 e 15 aceitos', () => {
  const c = lerCampos(gerarPixCopiaECola({ ...base, nome: 'A'.repeat(25), cidade: 'São José dos P' }));
  assert.equal(c['59'].length, 25);
  assert.equal(c['60'], 'SAO JOSE DOS P');
});

test('erros claros em português, sem mostrar o valor digitado', () => {
  const erro = (mudanca, trecho) => assert.throws(
    () => gerarPixCopiaECola({ ...base, ...mudanca }),
    (e) => { assert.match(e.message, trecho); assert.ok(!e.message.includes('teste@exemplo.com')); return true; },
  );
  erro({ chave: '' }, /chave Pix/);
  erro({ chave: undefined }, /chave Pix/);
  erro({ chave: 'x'.repeat(78) }, /chave Pix/);
  erro({ nome: '' }, /nome_recebedor_pix/);
  erro({ nome: 'A'.repeat(26) }, /25 caracteres/);
  erro({ cidade: '' }, /cidade_recebedor_pix/);
  erro({ cidade: 'A'.repeat(16) }, /15 caracteres/);
  erro({ valorCentavos: 0 }, /maior que zero/);
  erro({ valorCentavos: -5 }, /maior que zero/);
  erro({ valorCentavos: 10.5 }, /maior que zero/);
  erro({ valorCentavos: '15000' }, /maior que zero/);
  erro({ idTransacao: 'P 0001' }, /identificador/);
  erro({ idTransacao: 'A'.repeat(26) }, /identificador/);
});
