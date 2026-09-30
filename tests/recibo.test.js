// T09: dados do recibo (lógica pura) e geração do PDF contra um Google simulado. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/Recibo.js');
const { criarAmbiente } = require('./apoio/simulacao.js');

const config = { nome_profissional: 'Dra. Teste Exemplo', crn: 'CRN-0 00000', id_modelo_recibo: 'modelo123', id_pasta_recibos: 'pasta123' };
const pagamento = {
  linha: 2, id: 'PG000001', id_evento: 'e1', codigo_paciente: 'P9001', pagador_nome: 'Maria Souza Teste',
  pagador_cpf: '52998224725', valor_centavos: 15000, forma: 'pix', status: 'pago', data_pagamento: '2026-09-30', link_recibo: '',
};
const paciente = { primeiro_nome: 'Ana', inicial_sobrenome: 'S.' };
const consulta = { id_evento: 'e1', data: '2026-09-28' };

test('recibo completo traz todos os campos obrigatórios', () => {
  const { erros, dados } = R.montarDadosRecibo({ pagamento, config, paciente, consulta });
  assert.deepEqual(erros, []);
  assert.deepEqual(dados.campos, {
    numero_recibo: 'PG000001', pagador: 'Maria Souza Teste', linha_cpf: 'CPF: 529.982.247-25', valor: 'R$ 150,00',
    descricao: 'consulta de nutrição realizada em 28/09/2026', linha_paciente: 'Paciente: Ana S.', forma: 'Pix',
    data: '30/09/2026', profissional: 'Dra. Teste Exemplo', crn: 'CRN-0 00000',
  });
  const modelo = R.linhasModeloRecibo().join('\n');
  for (const campo of Object.keys(dados.campos)) assert.ok(modelo.includes(`{{${campo}}}`), `modelo sem {{${campo}}}`);
  assert.deepEqual(R.camposSobrando(modelo.replace(/\{\{(\w+)\}\}/g, (m, k) => dados.campos[k])), []);
});

test('nome do arquivo leva só número do recibo e código do paciente, nunca nome', () => {
  const { dados } = R.montarDadosRecibo({ pagamento, config, paciente, consulta });
  assert.equal(dados.nomeArquivo, 'Recibo-PG000001-P9001.pdf');
  assert.doesNotMatch(dados.nomeArquivo, /Maria|Ana|Souza/);
});

test('sem CPF a linha some; pagador igual ao paciente não repete a linha do paciente', () => {
  const p = { ...pagamento, pagador_cpf: '', pagador_nome: 'Ana Silva' };
  const { dados } = R.montarDadosRecibo({ pagamento: p, config, paciente, consulta });
  assert.equal(dados.campos.linha_cpf, '');
  assert.equal(dados.campos.linha_paciente, '');
});

test('recusa pagamento não pago, cortesia, pacote, valor zero, sem pagador, data ruim, CPF inválido', () => {
  const casos = [
    [{ status: 'a_receber' }, /não está pago/],
    [{ forma: 'cortesia' }, /recibo só para Pix/],
    [{ forma: 'pacote' }, /recibo só para Pix/],
    [{ valor_centavos: 0 }, /maior que zero/],
    [{ pagador_nome: '  ' }, /pagador_nome/],
    [{ data_pagamento: '30/09/2026' }, /data_pagamento/],
    [{ pagador_cpf: '52998224724' }, /CPF/],
    [{ pagador_cpf: '5299822472' }, /CPF/],
  ];
  for (const [mudanca, esperado] of casos) {
    const { erros, dados } = R.montarDadosRecibo({ pagamento: { ...pagamento, ...mudanca }, config, paciente, consulta });
    assert.equal(dados, null);
    assert.match(erros.join(' '), esperado);
    assert.doesNotMatch(erros.join(' '), /52998224724|5299822472/); // a mensagem nunca repete o CPF digitado
  }
});

test('faltando configuração, diz qual chave preencher', () => {
  const { erros } = R.montarDadosRecibo({ pagamento, config: { ...config, crn: null, id_modelo_recibo: '' }, paciente, consulta });
  assert.match(erros.join(' '), /"crn"/);
  assert.match(erros.join(' '), /"id_modelo_recibo"/);
});

test('recibo já emitido não é gerado de novo em silêncio', () => {
  const r = R.montarDadosRecibo({ pagamento: { ...pagamento, link_recibo: 'https://exemplo.invalid/x' }, config, paciente, consulta });
  assert.equal(r.jaTem, true);
  assert.equal(r.dados, null);
});

test('cifrão e barra do nome saem, para não virarem comando na troca de texto do Docs', () => {
  assert.equal(R.textoSeguroParaDocs('Ana $1 \\ Teste'), 'Ana 1 Teste');
});

// ---------- Google simulado ----------

function ambienteRecibo({ docsExtra } = {}) {
  const corpoTexto = [];
  const arquivos = new Map();
  const pasta = { id: 'pasta123', criados: [], createFile(blob) { const a = arquivoNovo(blob.nome, blob); pasta.criados.push(a); return a; } };
  function arquivoNovo(nome, blob) {
    const a = { id: `arq${arquivos.size + 1}`, nome, lixeira: false, blob, getId: () => a.id, getUrl: () => `https://exemplo.invalid/${a.id}`, setTrashed(v) { a.lixeira = v; return a; }, getName: () => a.nome };
    a.getAs = (tipo) => ({ tipo, nome: a.nome, setName(n) { this.nome = n; return this; } });
    a.makeCopy = (n) => arquivoNovo(n);
    arquivos.set(a.id, a);
    return a;
  }
  const modelo = arquivoNovo('modelo');
  modelo.id = 'modelo123'; arquivos.set('modelo123', modelo);
  const corpo = {
    texto: R.linhasModeloRecibo().join('\n') + (docsExtra || ''),
    replaceText(padrao, valor) { this.texto = this.texto.replace(new RegExp(padrao, 'g'), valor); return this; },
    getText() { return this.texto; }, appendParagraph(t) { corpoTexto.push(t); return this; },
  };
  const amb = criarAmbiente({
    configuracoes: [
      ['nome_profissional', 'Dra. Teste Exemplo'], ['crn', 'CRN-0 00000'], ['valor_primeira_consulta_centavos', '15000'], ['valor_retorno_centavos', '10000'],
      ['regra_retorno_dias', '30'], ['chave_pix', 'teste@exemplo.invalid'], ['nome_recebedor_pix', 'DRA TESTE'], ['cidade_recebedor_pix', 'SAO PAULO'],
      ['calendario_id', 'primary'], ['prefixo_evento_consulta', 'Consulta'], ['email_alertas', 'alerta@exemplo.invalid'],
      ['id_modelo_recibo', 'modelo123'], ['id_pasta_recibos', 'pasta123'],
    ],
    selecao: { aba: 'Pagamentos', linhas: [2] },
    google: {
      DriveApp: { getFileById: (id) => arquivos.get(id), getFolderById: () => pasta },
      DocumentApp: { openById: () => ({ getBody: () => corpo, getHeader: () => null, getFooter: () => null, saveAndClose() {} }) },
    },
  });
  amb.abas.get('Pacientes').linhas.push(['P9001', 'Ana', 'S.', '5511900000001', 'ana.teste@exemplo.invalid', 'leve', '', true]);
  amb.abas.get('Consultas').linhas.push(['e1', '2026-09-28', '09:00', 'primeira', 'P9001', 'realizada', '']);
  amb.abas.get('Pagamentos').linhas.push(['PG000001', 'e1', 'P9001', 'Maria Souza Teste', '52998224725', 15000, 'pix', 'pago', '2026-09-30', '']);
  amb.carregar('Esquema.js', 'Formatos.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Registro.js', 'Alertas.js', 'Execucao.js', 'LeitorAbas.js', 'Recibo.js', 'GeradorRecibo.js');
  return { amb, corpo, pasta, arquivos };
}

test('Google simulado: gera o PDF na pasta, apaga a cópia e grava o link', () => {
  const { amb, pasta, arquivos } = ambienteRecibo();
  amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.equal(pasta.criados.length, 1);
  assert.equal(pasta.criados[0].nome, 'Recibo-PG000001-P9001.pdf');
  assert.ok([...arquivos.values()].some((a) => a.nome.startsWith('rascunho-Recibo-PG000001-P9001') && a.lixeira), 'a cópia de trabalho não foi para a lixeira');
  assert.match(amb.abas.get('Pagamentos').linhas[1][9], /^https:\/\/exemplo\.invalid\//);
  // segunda vez: já tem recibo, não gera outro
  amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.equal(pasta.criados.length, 1);
});

test('Google simulado: campo desconhecido no modelo dela interrompe e não gera PDF', () => {
  const { amb, pasta } = ambienteRecibo({ docsExtra: '\n{{campo_inventado}}' });
  amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.match(amb.alertas.join('\n'), /campo_inventado/);
  assert.equal(pasta.criados.length, 0);
  assert.equal(amb.abas.get('Pagamentos').linhas[1][9], '');
});

test('Google simulado: recibo recusado mostra os problemas em português', () => {
  const { amb } = ambienteRecibo();
  amb.abas.get('Pagamentos').linhas[1][3] = '';
  amb.rodar('gerarReciboDaLinhaSelecionada()');
  assert.match(amb.alertas.join('\n'), /pagador_nome/);
  assert.equal(amb.emails.length, 0); // problema de uso não manda e-mail de alerta
});

test('Google simulado: cria modelo e pasta só quando os ids estão em branco', () => {
  const criados = [];
  const { amb } = ambienteRecibo();
  const linhasConfig = amb.abas.get('Configurações').linhas;
  for (const l of linhasConfig) if (l[0] === 'id_modelo_recibo' || l[0] === 'id_pasta_recibos') l[1] = '';
  const paragrafos = [];
  amb.contexto.DocumentApp.create = () => ({
    getBody: () => ({ clear() {}, appendParagraph: (t) => { paragrafos.push(t); } }), saveAndClose() {}, getId: () => 'novoDoc',
  });
  amb.contexto.DriveApp.createFolder = (n) => { criados.push(n); return { getId: () => 'novaPasta' }; };
  amb.rodar('criarModeloEPastaDeRecibos()');
  const valor = (k) => linhasConfig.find((l) => l[0] === k)[1];
  assert.equal(valor('id_modelo_recibo'), 'novoDoc');
  assert.equal(valor('id_pasta_recibos'), 'novaPasta');
  assert.ok(paragrafos.some((p) => p.includes('{{pagador}}')));
  amb.rodar('criarModeloEPastaDeRecibos()'); // segunda vez: não cria nada
  assert.equal(criados.length, 1);
  assert.match(amb.alertas.at(-1), /já estão configurados/);
});
