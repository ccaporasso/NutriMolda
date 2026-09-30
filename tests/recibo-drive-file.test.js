// Regressão da criação do modelo com drive.file. Só usa o consultório simulado e marcadores fictícios.
// Não prova o resultado no Google; a emissão real dos PDFs continua obrigatória.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio } = require('./apoio/fluxo.js');

test('Google simulado: modelo criado no Docs sem acesso por drive.file não pode ser copiado', () => {
  const c = criarConsultorio();
  const id = c.drive.DocumentApp.create('MODELO_FICTICIO_001').getId();
  assert.ok(c.drive.arquivos.has(id), 'o modelo existe para a conta simulada');
  assert.throws(() => c.rodar(`driveCopiar('${id}', 'rascunho', 'pasta123')`), /Arquivo não encontrado/);
});

test('Google simulado: criar modelo pela API Drive permite emitir dois valores e repetir sem duplicar', () => {
  const c = criarConsultorio();
  const cfg = c.amb.abas.get('Configurações').linhas;
  cfg.find((l) => l[0] === 'id_modelo_recibo')[1] = '';
  c.rodar('criarModeloEPastaDeRecibos()');
  const idModelo = cfg.find((l) => l[0] === 'id_modelo_recibo')[1];
  assert.equal(c.drive.arquivos.get(idModelo).tipo, 'application/vnd.google-apps.document');
  assert.equal(c.drive.chamadas.includes('DocumentApp.create'), false);

  c.rodar('sincronizarAgenda(); gerarAReceber()');
  c.selecionar('Pagamentos', 2, 3);
  c.rodar('marcarPagoPix()');
  for (const [linha, valor] of [[2, 15000], [3, 123456]]) {
    c.definir('Pagamentos', linha, 'pagador_nome', 'PAGADOR_FICTICIO_001');
    c.definir('Pagamentos', linha, 'valor_centavos', valor);
  }
  c.rodar('gerarRecibo(2); gerarRecibo(3)');
  const pdfs = c.drive.pdfsNaPasta();
  assert.equal(pdfs.length, 2);
  assert.match(pdfs[0].texto, /R\$ 150,00/);
  assert.match(pdfs[1].texto, /R\$ 1\.234,56/);
  for (const pdf of pdfs) assert.doesNotMatch(pdf.texto, /\{\{|\}\}/);
  assert.equal([...c.drive.arquivos.values()].filter((a) => a.nome.startsWith('rascunho-') && !a.lixeira).length, 0);
  const antes = c.drive.arquivos.size;
  assert.equal(c.rodar('gerarRecibo(2).jaTinha'), true);
  assert.equal(c.rodar('gerarRecibo(3).jaTinha'), true);
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.equal(c.drive.arquivos.size, antes);
  assert.equal(cfg.find((l) => l[0] === 'id_modelo_recibo')[1], idModelo);
});

test('Google simulado: marcadores fictícios da exceção de Drive e PDF não vazam no Registro ou e-mail', () => {
  for (const falha of ['copiar', 'exportarPdf']) {
    const c = criarConsultorio();
    c.rodar('sincronizarAgenda(); gerarAReceber()');
    c.selecionar('Pagamentos', 2);
    c.rodar('marcarPagoPix()');
    c.definir('Pagamentos', 2, 'pagador_nome', 'PAGADOR_FICTICIO_001');
    c.drive.falhas[falha] = true;
    c.rodar('gerarReciboDaLinhaSelecionada()');
    assert.equal(c.amb.emails.length, 1);
    assert.doesNotMatch(`${c.registroTexto()}\n${JSON.stringify(c.amb.emails)}`, /EXCECAO_FICTICIA_/);
  }
});
