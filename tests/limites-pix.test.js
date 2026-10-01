// Limites do Pix copia e cola (Gate, item 32): tamanhos do padrão EMV, valores extremos, nomes, chave e CRC.
// Só dados inventados. Complementa tests/pix.test.js, que cobre o caminho normal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularCrc16, normalizarTextoPix, gerarPixCopiaECola } = require('../src/Pix.js');

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

// Confere o payload inteiro como um leitor de banco faria: campos fecham, CRC bate, valor cabe em 13 caracteres.
function conferirPayload(texto) {
  const campos = lerCampos(texto);
  assert.equal(texto.slice(-4), calcularCrc16(texto.slice(0, -4)), 'CRC não confere');
  assert.ok(campos['54'].length <= 13, `valor com ${campos['54'].length} caracteres`);
  assert.match(campos['54'], /^\d+\.\d{2}$/);
  return campos;
}

const gerar = (mudanca) => gerarPixCopiaECola({ ...base, ...mudanca });

test('valor mínimo (1 centavo) e valores comuns geram payload válido', () => {
  for (const [centavos, esperado] of [[1, '0.01'], [9, '0.09'], [10, '0.10'], [99, '0.99'], [100, '1.00'], [10000000, '100000.00']]) {
    assert.equal(conferirPayload(gerar({ valorCentavos: centavos }))['54'], esperado);
  }
});

test('valor máximo que cabe no campo (13 caracteres) é aceito; um centavo a mais passa de 13 e é recusado', () => {
  assert.equal(conferirPayload(gerar({ valorCentavos: 999999999999 }))['54'], '9999999999.99');
  assert.throws(() => gerar({ valorCentavos: 1000000000000 }), /alto demais/);
});

test('valores absurdos (inteiros enormes, não seguros, infinitos, NaN) nunca viram payload', () => {
  for (const v of [Number.MAX_SAFE_INTEGER, 2 ** 53, 1e21, 1e300, Infinity, -Infinity, NaN]) {
    assert.throws(() => gerar({ valorCentavos: v }), /Pix/, `aceitou ${v}`);
  }
  for (const v of [0, -1, 0.5, 10.01, '100', null, undefined, {}, [], true]) {
    assert.throws(() => gerar({ valorCentavos: v }), /maior que zero/, `aceitou ${String(v)}`);
  }
});

test('a recusa por valor alto não mostra o valor nem a chave', () => {
  assert.throws(() => gerar({ valorCentavos: 1e21 }), (e) => !/1e\+?21|teste@exemplo/.test(e.message));
  assert.throws(() => gerar({ valorCentavos: 1000000000000 }), (e) => !/1000000000000|teste@exemplo/.test(e.message));
});

test('nome: 25 caracteres cabe, 26 não; acentos saem sem acento e contam depois de normalizar', () => {
  assert.equal(lerCampos(gerar({ nome: 'A'.repeat(25) }))['59'].length, 25);
  assert.throws(() => gerar({ nome: 'A'.repeat(26) }), /25 caracteres/);
  assert.equal(lerCampos(gerar({ nome: 'José da Conceição' }))['59'], 'JOSE DA CONCEICAO');
  // 25 letras com acento viram 25 letras sem acento: cabem.
  assert.equal(lerCampos(gerar({ nome: 'Ç'.repeat(25) }))['59'], 'C'.repeat(25));
  // 26 letras com acento passam do limite mesmo depois de normalizar.
  assert.throws(() => gerar({ nome: 'Ç'.repeat(26) }), /25 caracteres/);
});

test('nome só com caracteres que o padrão não aceita (japonês, emoji) é tratado como ausente', () => {
  assert.throws(() => gerar({ nome: '日本語' }), /nome_recebedor_pix/);
  assert.throws(() => gerar({ nome: '😀😀' }), /nome_recebedor_pix/);
  assert.throws(() => gerar({ nome: '   ' }), /nome_recebedor_pix/);
  assert.throws(() => gerar({ nome: 42 }), /nome_recebedor_pix/);
});

test('cidade: 15 caracteres cabe, 16 não; ausente é recusada', () => {
  assert.equal(lerCampos(gerar({ cidade: 'A'.repeat(15) }))['60'].length, 15);
  assert.throws(() => gerar({ cidade: 'A'.repeat(16) }), /15 caracteres/);
  assert.throws(() => gerar({ cidade: undefined }), /cidade_recebedor_pix/);
  assert.throws(() => gerar({ cidade: '日本' }), /cidade_recebedor_pix/);
});

test('o texto do nome é normalizado sem quebrar o campo (pontuação fica; controle e acento somem)', () => {
  assert.equal(normalizarTextoPix('Ana-Maria & Cia.'), 'ANA-MARIA & CIA.');
  assert.equal(normalizarTextoPix('Ação\tcom\nquebra'), 'ACAOCOMQUEBRA');
  // Mesmo com pontuação, o campo continua lendo certo: tamanho bate com o conteúdo.
  const c = lerCampos(gerar({ nome: 'Ana-Maria & Cia.' }));
  assert.equal(c['59'], 'ANA-MARIA & CIA.');
  conferirPayload(gerar({ nome: 'Ana-Maria & Cia.' }));
});

test('chave: cada formato aceito gera payload válido', () => {
  const chaves = ['teste@exemplo.com', '52998224725', '12345678000195', '+5511900000000', '123e4567-e89b-12d3-a456-426614174000'];
  for (const chave of chaves) {
    const campos = conferirPayload(gerar({ chave }));
    assert.equal(lerCampos(campos['26'])['01'], chave);
  }
});

test('chave: formatos inválidos e tamanhos extremos são recusados sem mostrar a chave', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  const invalidas = ['', '   ', 'abc', 'teste@', '@exemplo.com', '1'.repeat(11), '123.456.789-09', '(11) 90000-0000', '+55 11 90000-0000',
    uuid.slice(0, -1), 'x'.repeat(78), 'chavé@exemplo.com', 'a b@exemplo.com', undefined, null, 123, {}];
  for (const chave of invalidas) {
    assert.throws(() => gerar({ chave }), (e) => {
      assert.match(e.message, /chave Pix/);
      if (typeof chave === 'string' && chave.trim().length > 3) assert.ok(!e.message.includes(chave.trim()), 'a mensagem repetiu a chave');
      return true;
    }, `aceitou ${String(chave)}`);
  }
});

test('chave longa o bastante para estourar o campo 26 é recusada antes de montar o payload', () => {
  // 77 é o máximo que cabe; um e-mail de 77 caracteres ainda gera payload com tamanhos corretos, de 78 em diante não.
  const email77 = `${'a'.repeat(77 - '@exemplo.com'.length)}@exemplo.com`;
  assert.equal(email77.length, 77);
  const campos = conferirPayload(gerar({ chave: email77 }));
  assert.equal(lerCampos(campos['26'])['01'], email77);
  assert.throws(() => gerar({ chave: `a${email77}` }), /chave Pix/);
});

test('identificador da transação: 25 aceita, 26 e caracteres fora de letras/números recusados', () => {
  assert.equal(lerCampos(lerCampos(gerar({ idTransacao: 'A'.repeat(25) }))['62'])['05'].length, 25);
  for (const id of ['A'.repeat(26), 'P 0001', 'P-0001', 'P_0001', 'Pç01', '😀', 42, {}]) {
    assert.throws(() => gerar({ idTransacao: id }), /identificador/, `aceitou ${String(id)}`);
  }
  for (const id of [undefined, null, '']) assert.deepEqual(lerCampos(lerCampos(gerar({ idTransacao: id }))['62']), { '05': '***' });
});

test('CRC: qualquer alteração de um caractere do payload é detectada', () => {
  const texto = gerar({});
  const corpo = texto.slice(0, -4);
  const crc = texto.slice(-4);
  assert.equal(calcularCrc16(corpo), crc);
  // troca cada posição do corpo por outro caractere e confere que o CRC deixa de bater
  for (let i = 0; i < corpo.length; i++) {
    const trocado = corpo[i] === 'X' ? 'Y' : 'X';
    const adulterado = corpo.slice(0, i) + trocado + corpo.slice(i + 1);
    assert.notEqual(calcularCrc16(adulterado), crc, `alteração na posição ${i} passou despercebida`);
  }
  // CRC adulterado também não bate com o corpo
  assert.notEqual(calcularCrc16(corpo), '0000');
});

test('propriedade: payloads aleatórios (semente fixa) sempre fecham campos, tamanhos e CRC', () => {
  let estado = 20261001; // gerador congruencial: mesma sequência em toda máquina
  const proximo = (n) => { estado = (estado * 1664525 + 1013904223) % 4294967296; return estado % n; };
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyzáéíóúãõç.-&';
  const texto = (max) => Array.from({ length: 1 + proximo(max) }, () => letras[proximo(letras.length)]).join('');
  for (let i = 0; i < 300; i++) {
    const valorCentavos = 1 + proximo(999999999999);
    const nome = texto(25).trim() || 'A';
    const cidade = texto(15).trim() || 'A';
    let payload;
    try {
      payload = gerar({ valorCentavos, nome, cidade });
    } catch (e) {
      assert.match(e.message, /25 caracteres|15 caracteres|nome_recebedor|cidade_recebedor/); // única recusa esperada: texto que a normalização encurtou a nada ou deixou longo
      continue;
    }
    const campos = conferirPayload(payload);
    assert.equal(campos['54'], `${Math.floor(valorCentavos / 100)}.${String(valorCentavos % 100).padStart(2, '0')}`);
  }
});
