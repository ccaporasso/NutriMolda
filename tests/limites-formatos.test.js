// Limites sistemáticos de valores, CPF, datas e ids (Gate, item 25). Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/Formatos.js');
const { proximoNumeroPagamento, idPagamento } = require('../src/Pagamentos.js');

test('lerReais: fronteiras do valor (1 centavo, teto de R$ 100.000,00, um centavo acima)', () => {
  assert.deepEqual(F.lerReais('0,01'), { ok: true, centavos: 1 });
  assert.deepEqual(F.lerReais('100000'), { ok: true, centavos: 10000000 });
  assert.deepEqual(F.lerReais('100.000,00'), { ok: true, centavos: 10000000 });
  assert.equal(F.lerReais('100000,01').ok, false);
  assert.match(F.lerReais('100000,01').motivo, /alto demais/);
  for (const zero of ['0', '0,00', '0.00', 'R$ 0,00']) assert.match(F.lerReais(zero).motivo, /maior que zero/);
});

test('lerReais: formatos aceitos (R$, milhar, ponto ou vírgula decimal, uma casa) e recusados', () => {
  assert.equal(F.lerReais('R$ 150,00').centavos, 15000);
  assert.equal(F.lerReais('r$150').centavos, 15000);
  assert.equal(F.lerReais('1.500,00').centavos, 150000);
  assert.equal(F.lerReais('150.50').centavos, 15050);
  assert.equal(F.lerReais('150,5').centavos, 15050);
  assert.equal(F.lerReais('  150  ').centavos, 15000);
  for (const ruim of ['1,500.00', '1.5.0', '1e3', '0x10', '-5', '+5', '150,555', '150,', ',50', 'abc', '150 reais', '15 0,00', '１５０', '1,2,3']) {
    const r = F.lerReais(ruim);
    // "15 0,00" vira "150,00" por remoção de espaços (comportamento antigo, aceito); os demais são recusados.
    if (ruim === '15 0,00') { assert.equal(r.ok, true); continue; }
    assert.equal(r.ok, false, `aceitou "${ruim}"`);
    assert.ok(r.motivo.length > 10);
  }
});

test('lerReais: entradas vazias, nulas e gigantes nunca viram valor nem estouram', () => {
  for (const v of ['', '   ', null, undefined, 'R$']) assert.match(F.lerReais(v).motivo, /Digite o valor/);
  assert.equal(F.lerReais('9'.repeat(400)).ok, false); // Infinity não é inteiro seguro
  assert.equal(F.lerReais('9'.repeat(30)).ok, false);
  assert.equal(F.lerReais(`1${'0'.repeat(20)},00`).ok, false);
  assert.equal(F.lerReais(150).centavos, 15000); // número digitado direto na célula
  assert.equal(F.lerReais(150.5).centavos, 15050);
});

test('formatarReais: fronteiras e valores inválidos', () => {
  assert.equal(F.formatarReais(0), 'R$ 0,00');
  assert.equal(F.formatarReais(1), 'R$ 0,01');
  assert.equal(F.formatarReais(99), 'R$ 0,99');
  assert.equal(F.formatarReais(100), 'R$ 1,00');
  assert.equal(F.formatarReais(10000000), 'R$ 100.000,00');
  assert.equal(F.formatarReais(Number.MAX_SAFE_INTEGER), 'R$ 90.071.992.547.409,91');
  for (const v of [NaN, Infinity, -1, 1.5, '100', null, undefined, 2 ** 53]) assert.throws(() => F.formatarReais(v), /inválido/, `aceitou ${String(v)}`);
});

test('ida e volta: reais digitados -> centavos -> reais de saída (todos os centavos de 0,01 a 3,00 e valores redondos)', () => {
  for (let c = 1; c <= 300; c++) {
    const saida = F.formatarReaisSimples(c);
    assert.equal(F.lerReais(saida).centavos, c, `centavos ${c} -> "${saida}"`);
  }
  for (const c of [15000, 123456, 10000000, 99999, 100001]) assert.equal(F.lerReais(F.formatarReaisSimples(c)).centavos, c);
});

test('CPF: tamanhos, caracteres, repetidos e formatos', () => {
  const ok = '52998224725';
  assert.equal(F.cpfValido(ok), true);
  assert.equal(F.cpfValido(`${ok}0`), false); // 12 dígitos
  assert.equal(F.cpfValido(ok.slice(1)), false); // 10 dígitos
  assert.equal(F.cpfValido(''), false);
  assert.equal(F.cpfValido(null), false);
  assert.equal(F.cpfValido(undefined), false);
  assert.equal(F.cpfValido(52998224725), true); // número digitado na célula
  for (let d = 0; d <= 9; d++) assert.equal(F.cpfValido(String(d).repeat(11)), false, `repetido ${d}`);
  assert.equal(F.cpfValido('529.982.247-25'), true);
  assert.equal(F.cpfValido(' 529 982 247 25 '), true); // só dígitos contam
  assert.equal(F.cpfValido('529-982-247.25'), true);
  // erro em cada um dos 11 dígitos é detectado (um dígito trocado nunca mantém a validade, pelo módulo 11)
  for (let i = 0; i < 11; i++) {
    const ruim = ok.slice(0, i) + String((Number(ok[i]) + 1) % 10) + ok.slice(i + 1);
    assert.equal(F.cpfValido(ruim), false, `troca na posição ${i}`);
  }
});

test('datas: ano bissexto, fim de mês, virada de ano e datas impossíveis', () => {
  const soma = (t, n) => F.dataParaTexto(F.somarDiasNaData(F.textoParaData(t), n));
  assert.equal(soma('2028-02-28', 1), '2028-02-29');
  assert.equal(soma('2028-02-29', 1), '2028-03-01');
  assert.equal(soma('2026-02-28', 1), '2026-03-01');
  assert.equal(soma('2026-12-31', 1), '2027-01-01');
  assert.equal(soma('2027-01-01', -1), '2026-12-31');
  assert.equal(soma('2026-01-31', 30), '2026-03-02');
  assert.equal(soma('2026-09-30', 0), '2026-09-30');
  assert.equal(F.textoParaData('2028-02-29').dia, 29);
  for (const ruim of ['2026-02-29', '2100-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-1', '26-01-01', '2026/01/01', '', ' 2026-01-01', '2026-01-01 ', null, undefined, 20260101]) {
    assert.equal(F.textoParaData(ruim), null, `aceitou ${String(ruim)}`);
  }
  assert.equal(F.textoParaData('2000-02-29').dia, 29); // 2000 é bissexto (divisível por 400)
});

test('instante: virada de dia em São Paulo (UTC-3), meia-noite, fim do dia e virada de ano', () => {
  const l = F.dataHoraLocal;
  assert.deepEqual(l('2026-10-05T03:00:00Z'), { data: '2026-10-05', hora: '00:00' }); // meia-noite em SP
  assert.deepEqual(l('2026-10-05T02:59:00Z'), { data: '2026-10-04', hora: '23:59' }); // um minuto antes
  assert.deepEqual(l('2027-01-01T02:59:59Z'), { data: '2026-12-31', hora: '23:59' });
  assert.deepEqual(l('2028-03-01T02:59:00Z'), { data: '2028-02-29', hora: '23:59' }); // bissexto
  assert.deepEqual(l('2026-10-05T00:00:00-03:00'), { data: '2026-10-05', hora: '00:00' });
  assert.deepEqual(l('2026-10-05T23:59:00-03:00'), { data: '2026-10-05', hora: '23:59' });
  assert.deepEqual(l('2026-10-05T10:00:00+00:00'), { data: '2026-10-05', hora: '07:00' });
  assert.deepEqual(l('2026-10-05T10:00:00.000Z'), { data: '2026-10-05', hora: '07:00' });
  assert.deepEqual(l('2026-10-05T10:00:00-0300'), { data: '2026-10-05', hora: '10:00' });
  for (const ruim of ['', '2026-10-05', '2026-10-05T10:00:00', '2026-10-05T25:00:00Z', '2026-13-05T10:00:00Z', 'ontem', null, undefined, 20261005, {}]) {
    assert.equal(l(ruim), null, `aceitou ${String(ruim)}`);
  }
});

test('ids de pagamento: sequência, buraco, apagar linha no meio e estouro da largura de 6 dígitos', () => {
  assert.equal(proximoNumeroPagamento([]), 1);
  assert.equal(idPagamento(1), 'PG000001');
  assert.equal(idPagamento(999999), 'PG999999');
  assert.equal(idPagamento(1000000), 'PG1000000'); // passou da largura: continua único e ordenado por número, não por texto
  assert.equal(proximoNumeroPagamento([{ id: 'PG000001' }, { id: 'PG000005' }, { id: 'PG000003' }]), 6);
  assert.equal(proximoNumeroPagamento([{ id: 'PG999999' }]), 1000000);
  assert.equal(proximoNumeroPagamento([{ id: 'PG1000000' }, { id: 'PG000007' }]), 1000001);
  // ids estranhos (vazio, texto, minúsculo, lixo) não contam e não quebram
  assert.equal(proximoNumeroPagamento([{ id: '' }, { id: 'abc' }, { id: 'pg000009' }, { id: undefined }, { id: 'PG' }, { id: 'PGx1' }]), 1);
});
