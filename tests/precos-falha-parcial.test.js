// Gate B: "Definir preços" grava dois valores, um de cada vez. Se o Planilhas falhar entre os dois, o que acontece é conhecido e seguro:
// o primeiro preço fica gravado, o segundo continua como estava, a falha vai ao Registro e ao e-mail (sem o texto do erro) e repetir o menu termina o serviço.
// Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio } = require('./apoio/fluxo.js');

const NUMERO_FICTICIO = '1'.repeat(11); // montado em código: o varredor de dados pessoais não pode ver um número de 11 dígitos escrito

function valor(c, chave) {
  return Number(c.linhas('Configurações').find((l) => l[0] === chave)[1]);
}

function responderPrecos(c, respostas) {
  let n = 0;
  c.amb.ui.prompt = (...a) => { c.amb.alertas.push(`PROMPT ${a[0]}`); const r = respostas[n++]; return { getSelectedButton: () => 'OK', getResponseText: () => r }; };
}

test('falha ao gravar o segundo preço: o primeiro fica, o segundo não muda, Registro e e-mail avisam sem o texto do erro', () => {
  const c = criarConsultorio();
  responderPrecos(c, ['180,00', '120,00']);
  const aba = c.amb.abas.get('Configurações');
  const original = aba.getRange.bind(aba);
  let escritas = 0;
  aba.getRange = (...a) => {
    const r = original(...a);
    const setValues = r.setValues;
    r.setValues = (v) => { if (++escritas === 2) throw new Error(`Exceeded maximum execution time com Maria Fictícia ${NUMERO_FICTICIO}`); return setValues(v); };
    return r;
  };
  c.rodar('definirPrecosDasConsultas()');
  aba.getRange = original;
  assert.equal(valor(c, 'valor_primeira_consulta_centavos'), 18000, 'o primeiro preço foi gravado');
  assert.equal(valor(c, 'valor_retorno_centavos'), 10000, 'o segundo continua como estava');
  const registro = JSON.stringify(c.linhas('Registro'));
  assert.match(registro, /Falha no módulo configuracoes/);
  assert.doesNotMatch(registro + JSON.stringify(c.amb.emails), new RegExp(`Maria|${NUMERO_FICTICIO}|Exceeded`), 'o texto do erro não vai ao Registro nem ao e-mail');
  assert.equal(c.amb.emails.length, 1);
});

test('repetir o menu depois da falha termina o serviço: os dois preços ficam gravados, sem duplicar nada', () => {
  const c = criarConsultorio();
  responderPrecos(c, ['180,00', '120,00']);
  const aba = c.amb.abas.get('Configurações');
  const original = aba.getRange.bind(aba);
  let escritas = 0;
  aba.getRange = (...a) => {
    const r = original(...a);
    const setValues = r.setValues;
    r.setValues = (v) => { if (++escritas === 2) throw new Error('falha de rede'); return setValues(v); };
    return r;
  };
  c.rodar('definirPrecosDasConsultas()');
  aba.getRange = original;
  responderPrecos(c, ['180,00', '120,00']);
  c.rodar('definirPrecosDasConsultas()');
  assert.equal(valor(c, 'valor_primeira_consulta_centavos'), 18000);
  assert.equal(valor(c, 'valor_retorno_centavos'), 12000);
  assert.equal(c.linhas('Configurações').filter((l) => l[0] === 'valor_retorno_centavos').length, 1);
});
