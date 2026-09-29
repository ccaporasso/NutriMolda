// Confere a leitura e validação das Configurações (T02). Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIGURACOES_INICIAIS } = require('../src/Esquema.js');
const {
  CHAVES_CONFIGURACAO, validarConfiguracoes, precoParaCobranca, montarMensagemErros,
} = require('../src/Configuracoes.js');

// Configuração completa e válida, toda inventada.
function linhasValidas() {
  return [
    ['nome_profissional', 'Profissional de Teste'],
    ['crn', 'CRN-0 00000'],
    ['valor_primeira_consulta_centavos', 25000],
    ['valor_retorno_centavos', 15000],
    ['regra_retorno_dias', 30],
    ['chave_pix', 'teste@exemplo.com'],
    ['nome_recebedor_pix', 'PROFISSIONAL DE TESTE'],
    ['cidade_recebedor_pix', 'SAO PAULO'],
    ['calendario_id', 'primary'],
    ['prefixo_evento_consulta', 'Consulta'],
    ['email_alertas', 'alertas@exemplo.com'],
    ['id_modelo_recibo', 'id-modelo-de-teste'],
    ['id_pasta_recibos', 'id-pasta-de-teste'],
  ];
}

function com(chave, valor) {
  return linhasValidas().map((l) => (l[0] === chave ? [chave, valor] : l));
}

function sem(chave) {
  return linhasValidas().filter((l) => l[0] !== chave);
}

test('as chaves validadas são exatamente as do esquema da planilha', () => {
  assert.deepEqual(CHAVES_CONFIGURACAO.slice().sort(), CONFIGURACOES_INICIAIS.map(([c]) => c).sort());
});

test('configuração completa: sem erro nem aviso, com valores tipados', () => {
  const r = validarConfiguracoes(linhasValidas());
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.config.valor_primeira_consulta_centavos, 25000);
  assert.equal(r.config.regra_retorno_dias, 30);
  assert.equal(r.config.email_alertas, 'alertas@exemplo.com');
});

test('a planilha recém-instalada dá erros só nos campos de identidade, Pix e alerta', () => {
  const r = validarConfiguracoes(CONFIGURACOES_INICIAIS);
  assert.equal(r.erros.length, 6);
  for (const chave of ['nome_profissional', 'crn', 'chave_pix', 'nome_recebedor_pix',
    'cidade_recebedor_pix', 'email_alertas']) {
    assert.ok(r.erros.some((e) => e.includes(`"${chave}"`)), chave);
  }
});

test('chave ausente obrigatória: erro dizendo o que fazer', () => {
  const r = validarConfiguracoes(sem('chave_pix'));
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /Falta a linha "chave_pix"/);
  assert.equal(r.config.chave_pix, null);
});

test('valor obrigatório em branco (ou só espaços): erro', () => {
  for (const vazio of ['', '   ', null, undefined]) {
    const r = validarConfiguracoes(com('crn', vazio));
    assert.equal(r.erros.length, 1);
    assert.match(r.erros[0], /"crn" não foi preenchida/);
  }
});

test('chave ausente opcional: aviso, sem erro; padrões do kit são aplicados', () => {
  const r = validarConfiguracoes(sem('calendario_id').filter((l) => l[0] !== 'id_pasta_recibos'));
  assert.deepEqual(r.erros, []);
  assert.equal(r.avisos.length, 2);
  assert.equal(r.config.calendario_id, 'primary');
  assert.equal(r.config.id_pasta_recibos, null);
});

test('espaços nas pontas são aceitos e removidos', () => {
  const r = validarConfiguracoes(com('nome_profissional', '  Fulana de Teste  '));
  assert.deepEqual(r.erros, []);
  assert.equal(r.config.nome_profissional, 'Fulana de Teste');
});

test('chave repetida: erro (não escolhe uma das linhas sozinho)', () => {
  const r = validarConfiguracoes(linhasValidas().concat([['crn', 'outro']]));
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /"crn" aparece mais de uma vez/);
  assert.equal(r.config.crn, null);
});

// Preços em centavos: ausente ou zero = aviso; negativo, fracionário ou texto = erro.
test('preço ausente, em branco ou zero: só aviso, e o valor não vira cobrança', () => {
  for (const valor of ['', null, 0, '0']) {
    const r = validarConfiguracoes(com('valor_retorno_centavos', valor));
    assert.deepEqual(r.erros, [], String(valor));
    assert.equal(r.avisos.length, 1, String(valor));
    assert.match(r.avisos[0], /valor_retorno_centavos/);
  }
  const ausente = validarConfiguracoes(sem('valor_retorno_centavos'));
  assert.deepEqual(ausente.erros, []);
  assert.equal(ausente.config.valor_retorno_centavos, null);
});

test('preço aceito como número ou como texto só com algarismos', () => {
  assert.equal(validarConfiguracoes(com('valor_primeira_consulta_centavos', '15000')).config.valor_primeira_consulta_centavos, 15000);
  assert.equal(validarConfiguracoes(com('valor_primeira_consulta_centavos', 15000)).config.valor_primeira_consulta_centavos, 15000);
});

test('preço negativo: erro', () => {
  for (const valor of [-1, -15000, '-100', '-1,5']) {
    const r = validarConfiguracoes(com('valor_primeira_consulta_centavos', valor));
    assert.equal(r.erros.length, 1, String(valor));
    assert.match(r.erros[0], /não pode ser negativa/);
    assert.equal(r.config.valor_primeira_consulta_centavos, null);
  }
});

test('preço fracionário (inclusive "150,00" e "150.00"): erro, sem ambiguidade', () => {
  for (const valor of [150.5, '150,00', '150.00', '1.500,00']) {
    const r = validarConfiguracoes(com('valor_primeira_consulta_centavos', valor));
    assert.equal(r.erros.length, 1, String(valor));
    assert.match(r.erros[0], /número inteiro de centavos/);
  }
});

test('preço em texto inválido: erro', () => {
  for (const valor of ['R$ 150', 'cento e cinquenta', '1e3', '15 000', true, NaN, Infinity, new Date(0)]) {
    const r = validarConfiguracoes(com('valor_primeira_consulta_centavos', valor));
    assert.equal(r.erros.length, 1, String(valor));
    assert.equal(r.config.valor_primeira_consulta_centavos, null);
  }
});

test('preço pequeno demais dá aviso de que o campo é em centavos', () => {
  const r = validarConfiguracoes(com('valor_primeira_consulta_centavos', 150));
  assert.deepEqual(r.erros, []);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /em centavos/);
  assert.equal(r.config.valor_primeira_consulta_centavos, 150);
});

test('regra_retorno_dias: inteiro maior que zero; em branco só avisa', () => {
  for (const valor of [0, -3, 2.5, 'trinta', '30,5']) {
    assert.equal(validarConfiguracoes(com('regra_retorno_dias', valor)).erros.length, 1, String(valor));
  }
  const r = validarConfiguracoes(com('regra_retorno_dias', ''));
  assert.deepEqual(r.erros, []);
  assert.equal(r.avisos.length, 1);
});

// Campos do padrão Pix.
test('nome do recebedor Pix: 25 caracteres passa, 26 dá erro', () => {
  assert.deepEqual(validarConfiguracoes(com('nome_recebedor_pix', 'A'.repeat(25))).erros, []);
  const r = validarConfiguracoes(com('nome_recebedor_pix', 'A'.repeat(26)));
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /"nome_recebedor_pix" tem 26 caracteres; o máximo do Pix é 25/);
  assert.equal(r.config.nome_recebedor_pix, null);
});

test('cidade do recebedor Pix: 15 caracteres passa, 16 dá erro', () => {
  assert.deepEqual(validarConfiguracoes(com('cidade_recebedor_pix', 'B'.repeat(15))).erros, []);
  const r = validarConfiguracoes(com('cidade_recebedor_pix', 'B'.repeat(16)));
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /"cidade_recebedor_pix" tem 16 caracteres; o máximo do Pix é 15/);
});

test('o tamanho do nome Pix conta letras acentuadas como um caractere só', () => {
  assert.deepEqual(validarConfiguracoes(com('nome_recebedor_pix', 'Ç'.repeat(25))).erros, []);
});

test('e-mail de alertas inválido: erro', () => {
  for (const valor of ['sem-arroba', 'a@b', 'a b@c.com', '@exemplo.com']) {
    const r = validarConfiguracoes(com('email_alertas', valor));
    assert.equal(r.erros.length, 1, valor);
    assert.match(r.erros[0], /"email_alertas"/);
  }
});

test('nenhuma mensagem repete o valor digitado (privacidade)', () => {
  const segredos = ['segredo-pix@exemplo.com', 'email-invalido-secreto', 'texto-secreto-no-preco', 'X'.repeat(40)];
  const linhas = com('chave_pix', segredos[0])
    .map((l) => {
      if (l[0] === 'email_alertas') return [l[0], segredos[1]];
      if (l[0] === 'valor_retorno_centavos') return [l[0], segredos[2]];
      if (l[0] === 'nome_recebedor_pix') return [l[0], segredos[3]];
      return l;
    });
  const r = validarConfiguracoes(linhas);
  assert.equal(r.erros.length, 3);
  const tudo = r.erros.concat(r.avisos).concat(montarMensagemErros(r)).join('\n');
  for (const s of segredos) assert.ok(!tudo.includes(s), s);
});

test('mensagem final lista todos os erros de uma vez', () => {
  const msg = montarMensagemErros(validarConfiguracoes(CONFIGURACOES_INICIAIS));
  assert.match(msg, /^Há problemas na aba Configurações:/);
  assert.equal(msg.split('\n').filter((l) => l.startsWith('- ')).length, 6);
});

test('entrada vazia ou nula não quebra', () => {
  assert.doesNotThrow(() => validarConfiguracoes([]));
  assert.doesNotThrow(() => validarConfiguracoes(null));
  assert.doesNotThrow(() => validarConfiguracoes([[], ['', 'x'], [null, null]]));
});

// Trava de cobrança: configuração incompleta nunca vira R$ 0,00.
test('preço válido é devolvido em centavos, por tipo', () => {
  const { config } = validarConfiguracoes(linhasValidas());
  assert.equal(precoParaCobranca(config, 'primeira'), 25000);
  assert.equal(precoParaCobranca(config, 'retorno'), 15000);
});

test('preço zero, em branco, ausente ou inválido bloqueia a cobrança', () => {
  for (const valor of [0, '', null, -5, 12.5, 'abc']) {
    const { config } = validarConfiguracoes(com('valor_retorno_centavos', valor));
    assert.throws(() => precoParaCobranca(config, 'retorno'), /Nenhuma cobrança foi criada/, String(valor));
  }
  const { config } = validarConfiguracoes(sem('valor_primeira_consulta_centavos'));
  assert.throws(() => precoParaCobranca(config, 'primeira'), /Nenhuma cobrança foi criada/);
});

test('a mensagem do bloqueio aponta a chave e a cortesia como escolha explícita', () => {
  const { config } = validarConfiguracoes(com('valor_primeira_consulta_centavos', 0));
  assert.throws(() => precoParaCobranca(config, 'primeira'),
    (e) => /valor_primeira_consulta_centavos/.test(e.message) && /cortesia/.test(e.message));
});

test('sem configuração ou tipo desconhecido, a cobrança é bloqueada', () => {
  assert.throws(() => precoParaCobranca(undefined, 'primeira'), /Nenhuma cobrança foi criada/);
  assert.throws(() => precoParaCobranca({}, 'primeira'), /Nenhuma cobrança foi criada/);
  assert.throws(() => precoParaCobranca(linhasValidas(), 'cortesia'), /Tipo de consulta inválido/);
  assert.throws(() => precoParaCobranca({ valor_primeira_consulta_centavos: 100 }, undefined), /Tipo de consulta inválido/);
});
