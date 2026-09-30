// T23 (esqueleto): frases e link wa.me. Só dados inventados (telefones de exemplo 55 11 90000-xxxx).
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/Frases.js');

const paciente = { primeiro_nome: 'Ana', telefone: '5511900000001', autorizou_mensagens_em: '2026-09-01 10:00:00' };

test('as frases do esqueleto passam na própria validação', () => {
  for (const f of F.FRASES_MODELO) assert.equal(F.validarFrase(f.texto).ok, true, f.id);
});

test('validação recusa vazia, longa, campo desconhecido, chave solta, link e número longo', () => {
  const casos = [
    ['', /vazia/], ['a'.repeat(301), /passa de/], ['Oi {peso}!', /não é permitido/], ['Oi {primeiro_nome!', /solta/],
    ['Veja https://exemplo.invalid', /link/], ['Ligue 11900000001', /número longo/], ['Oi {diagnostico}', /não é permitido/],
  ];
  for (const [texto, esperado] of casos) {
    const v = F.validarFrase(texto);
    assert.equal(v.ok, false, texto);
    assert.match(v.motivo, esperado);
  }
});

test('preencher troca o primeiro nome; sem nome dá erro claro em vez de deixar o campo cru', () => {
  assert.equal(F.preencherFrase('Oi, {primeiro_nome}!', paciente), 'Oi, Ana!');
  assert.throws(() => F.preencherFrase('Oi, {primeiro_nome}!', { primeiro_nome: ' ' }), /primeiro nome/);
  assert.equal(F.preencherFrase('Bom dia!', { primeiro_nome: '' }), 'Bom dia!');
});

test('telefone: aceita com ou sem 55, com máscara, fixo ou celular; recusa o resto', () => {
  for (const t of ['5511900000001', '11900000001', '(11) 90000-0001', '+55 11 90000-0001']) assert.equal(F.telefoneParaWhatsapp(t), '5511900000001');
  assert.equal(F.telefoneParaWhatsapp('1133334444'), '551133334444');
  for (const t of ['', '123', '900000001', undefined, '551190000000123']) assert.throws(() => F.telefoneParaWhatsapp(t), /Telefone inválido/);
});

test('link wa.me leva o texto codificado; nada é enviado, é só um endereço', () => {
  const l = F.montarLinkWhatsapp('11900000001', 'Oi, Ana! Como foi a semana?');
  assert.equal(l, 'https://wa.me/5511900000001?text=Oi%2C%20Ana!%20Como%20foi%20a%20semana%3F');
  assert.equal(decodeURIComponent(new URL(l).searchParams.get('text')), 'Oi, Ana! Como foi a semana?');
  assert.throws(() => F.montarLinkWhatsapp('11900000001', 'Oi {peso}'), /não é permitido/);
});

test('linkDaFrase: usa a biblioteca; recusa paciente sem autorização, sem telefone ou frase inexistente', () => {
  assert.match(F.linkDaFrase('F01', paciente), /^https:\/\/wa\.me\/5511900000001\?text=Oi%2C%20Ana/);
  assert.throws(() => F.linkDaFrase('F01', { ...paciente, autorizou_mensagens_em: '' }), /não autorizou/);
  assert.throws(() => F.linkDaFrase('F01', { ...paciente, telefone: '' }), /Telefone inválido/);
  assert.throws(() => F.linkDaFrase('F99', paciente), /não encontrada/);
});
