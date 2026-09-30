// T20 (esqueleto): link do formulário e validação da resposta. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/Respostas.js');

const base = 'https://docs.google.com/forms/d/e/1FAIpQLSexemploinventado/viewform';

test('link traz o código já preenchido e sempre no mesmo formato', () => {
  const l = R.montarLinkFormulario({ urlBase: base, idCampoCodigo: 'entry.123456', codigo: 'P9001' });
  assert.equal(l, `${base}?usp=pp_url&entry.123456=P9001`);
  assert.equal(R.montarLinkFormulario({ urlBase: `${base}?usp=sf_link`, idCampoCodigo: 'entry.1', codigo: 'P9002' }), `${base}?usp=pp_url&entry.1=P9002`);
});

test('link recusa endereço que não é de Google Formulário, campo mal formado e código inválido', () => {
  const ok = { urlBase: base, idCampoCodigo: 'entry.1', codigo: 'P9001' };
  assert.throws(() => R.montarLinkFormulario({ ...ok, urlBase: 'https://exemplo.invalid/form' }), /Google Formulário/);
  assert.throws(() => R.montarLinkFormulario({ ...ok, idCampoCodigo: 'campo' }), /entry/);
  for (const codigo of ['', 'Ana', 'P12', 'P9001&x=1', undefined]) assert.throws(() => R.montarLinkFormulario({ ...ok, codigo }), /Código/);
});

const conhecidos = ['P9001', 'P9002'];
const resp = (extra = {}) => ({ dataHora: '2026-09-30 12:00:00', codigo: 'P9001', resposta: 'sim', nota: '', ...extra });

test('resposta válida vira linha na ordem da aba Respostas', () => {
  assert.deepEqual(R.ABA_RESPOSTAS.cabecalho, ['data_hora', 'codigo_paciente', 'resposta', 'nota']);
  assert.deepEqual(R.validarResposta(resp(), conhecidos).linha, ['2026-09-30 12:00:00', 'P9001', 'sim', '']);
});

test('código desconhecido, resposta fora da lista e data ruim são recusados sem gravar', () => {
  for (const extra of [{ codigo: 'P9099' }, { codigo: 'x' }, { resposta: 'talvez' }, { dataHora: '30/09/2026' }]) {
    const r = R.validarResposta(resp(extra), conhecidos);
    assert.equal(r.ok, false);
    assert.equal(r.linha, undefined);
  }
});

test('nota: e-mail e telefone são ocultados, texto longo é cortado e fórmula é neutralizada', () => {
  const r = R.validarResposta(resp({ nota: 'fale comigo em ana.teste@exemplo.invalid ou 11 90000-0001' }), conhecidos);
  assert.doesNotMatch(r.linha[3], /exemplo\.invalid|90000/);
  assert.ok(Array.from(R.validarResposta(resp({ nota: 'a'.repeat(1000) }), conhecidos).linha[3]).length <= R.MAX_NOTA + 1);
  assert.equal(R.validarResposta(resp({ nota: '=1+1' }), conhecidos).linha[3], ' =1+1');
});
