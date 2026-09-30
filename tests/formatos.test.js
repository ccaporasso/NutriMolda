const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/Formatos.js');

test('datas: soma dias e valida texto', () => {
  assert.equal(F.dataParaTexto(F.somarDiasNaData({ ano: 2026, mes: 9, dia: 30 }, 7)), '2026-10-07');
  assert.equal(F.dataParaTexto(F.somarDiasNaData({ ano: 2026, mes: 3, dia: 1 }, -1)), '2026-02-28');
  assert.deepEqual(F.textoParaData('2026-09-30'), { ano: 2026, mes: 9, dia: 30 });
  assert.equal(F.textoParaData('2026-02-30'), null);
  assert.equal(F.textoParaData('30/09/2026'), null);
});

test('instante do Google Agenda vira data e hora de São Paulo', () => {
  assert.deepEqual(F.dataHoraLocal('2026-09-30T09:00:00-03:00'), { data: '2026-09-30', hora: '09:00' });
  assert.deepEqual(F.dataHoraLocal('2026-09-30T12:00:00Z'), { data: '2026-09-30', hora: '09:00' });
  assert.deepEqual(F.dataHoraLocal('2026-10-01T01:30:00Z'), { data: '2026-09-30', hora: '22:30' });
  assert.equal(F.dataHoraLocal('2026-09-30'), null); // evento de dia inteiro
  assert.equal(F.dataHoraLocal(undefined), null);
});

test('reais só na saída, a partir de centavos inteiros', () => {
  assert.equal(F.formatarReais(15000), 'R$ 150,00');
  assert.equal(F.formatarReais(5), 'R$ 0,05');
  assert.equal(F.formatarReais(123456), 'R$ 1.234,56');
  assert.equal(F.formatarReaisSimples(123456), '1.234,56');
  assert.throws(() => F.formatarReais(1.5));
  assert.throws(() => F.formatarReais(-1));
});

test('CPF: dígitos verificadores e formatação (números inventados de teste)', () => {
  assert.equal(F.cpfValido('529.982.247-25'), true);
  assert.equal(F.cpfValido('52998224725'), true);
  assert.equal(F.cpfValido('52998224724'), false);
  assert.equal(F.cpfValido('11111111111'), false);
  assert.equal(F.cpfValido('5299822472'), false); // perdeu o zero
  assert.equal(F.formatarCpf('52998224725'), '529.982.247-25');
});
