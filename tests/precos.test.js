// D17: preços digitados em reais, gravados em centavos. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/Formatos.js');
const { criarConsultorio } = require('./apoio/fluxo.js');

test('lerReais converte o que ela digita em centavos', () => {
  for (const [texto, centavos] of [['150', 15000], ['150,00', 15000], ['R$ 150,00', 15000], ['1.500,00', 150000], ['150.5', 15050], ['0,50', 50], ['99,9', 9990], [' 80 ', 8000]]) {
    assert.deepEqual(F.lerReais(texto), { ok: true, centavos }, texto);
  }
});

test('lerReais recusa vazio, zero, negativo, texto, três casas e valor absurdo', () => {
  for (const texto of ['', '   ', '0', '0,00', '-10', 'cem', '150,123', '15,0,0', '1,5,', 'R$', '999999999']) {
    assert.equal(F.lerReais(texto).ok, false, texto);
  }
  assert.equal(F.lerReais(undefined).ok, false);
});

function lerConfig(c, chave) {
  return c.linhas('Configurações').find((l) => l[0] === chave)[1];
}

test('menu "Definir preços": R$ 180,00 vira 18000 e o retorno em branco não muda', () => {
  const c = criarConsultorio({ opcoes: { resposta: '180,00' } });
  let n = 0;
  c.amb.ui.prompt = (...a) => { c.amb.alertas.push(`PROMPT ${a[0]}`); n++; return { getSelectedButton: () => 'OK', getResponseText: () => (n === 1 ? '180,00' : '') }; };
  c.rodar('definirPrecosDasConsultas()');
  assert.equal(Number(lerConfig(c, 'valor_primeira_consulta_centavos')), 18000);
  assert.equal(Number(lerConfig(c, 'valor_retorno_centavos')), 10000);
});

test('menu "Definir preços": valor inválido não grava nada e explica', () => {
  const c = criarConsultorio({ opcoes: { resposta: 'cem' } });
  c.rodar('definirPrecosDasConsultas()');
  assert.equal(Number(lerConfig(c, 'valor_primeira_consulta_centavos')), 15000);
  assert.match(c.ultimoAlerta(), /Nada foi gravado/);
});

test('preço abaixo de R$ 10,00 pede confirmação; "não" não grava', () => {
  const c = criarConsultorio({ opcoes: { resposta: '1,50', negar: true } });
  c.rodar('definirPrecosDasConsultas()');
  assert.equal(Number(lerConfig(c, 'valor_primeira_consulta_centavos')), 15000);
});

test('gerar a receber com preço de R$ 1,50 (150 no campo de centavos) pede confirmação e "não" não cobra', () => {
  const c = criarConsultorio({ opcoes: { negar: true } });
  c.rodar('sincronizarAgenda()');
  const linha = c.amb.abas.get('Configurações').linhas.find((l) => l[0] === 'valor_primeira_consulta_centavos');
  linha[1] = '150';
  c.rodar('gerarAReceberPeloMenu()');
  assert.equal(c.linhas('Pagamentos').length, 0);
  assert.match(c.ultimoAlerta(), /Preço muito baixo/);
});
