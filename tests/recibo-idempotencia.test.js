// Achado P0 do Gate de Continuidade: o recibo não pode duplicar depois de falha parcial + nova tentativa.
// Invariantes (docs/MATRIZ-INTEGRIDADE.md):
//   R1 no máximo um recibo ativo por pagamento; R2 repetir não cria outro; R3 PDF existente + link ausente => religa o link;
//   R4 sem certeza do estado anterior, reconcilia antes de criar; R5 um recibo nunca é ligado ao pagamento errado.
// Só dados inventados. O Google é simulado (E2): não prova o comportamento real do Drive.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio, textoQuePodeVazar } = require('./apoio/fluxo.js');

const SENSIVEL = /diabetes|Maria Souza|Ana S\.|52998224725/;

function comPagamentoPago() {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  c.rodar('gerarAReceber()');
  const linha = c.linhaOnde('Pagamentos', 'codigo_paciente', 'P9001');
  c.selecionar('Pagamentos', linha);
  c.rodar('marcarPagoPix()');
  c.definir('Pagamentos', linha, 'pagador_nome', 'Maria Souza Teste');
  c.definir('Pagamentos', linha, 'pagador_cpf', '52998224725');
  return { c, linha };
}

const gerar = (c, linha) => { c.selecionar('Pagamentos', linha); c.rodar('gerarReciboDaLinhaSelecionada()'); };
const rascunhosForaDaLixeira = (c) => [...c.drive.arquivos.values()].filter((a) => a.nome.startsWith('rascunho-') && !a.lixeira);

// Faz a gravação do link em Pagamentos falhar (a planilha recusa a escrita só na coluna link_recibo).
function quebrarGravacaoDoLink(c) {
  const aba = c.amb.abas.get('Pagamentos');
  const original = aba.getRange.bind(aba);
  const idx = aba.linhas[0].indexOf('link_recibo') + 1;
  let ligado = true;
  aba.getRange = (linha, coluna, nl, nc) => {
    const r = original(linha, coluna, nl, nc);
    if (ligado && coluna === idx && linha > 1) {
      return { ...r, setValues() { throw new Error('Falha ao gravar: EXCECAO_FICTICIA_PLANILHA_001'); }, setValue() { throw new Error('Falha ao gravar: EXCECAO_FICTICIA_PLANILHA_001'); } };
    }
    return r;
  };
  return { consertar() { ligado = false; } };
}

test('ACHADO P0: PDF criado e gravação do link falha; a nova tentativa religa o PDF existente, sem criar o segundo', () => {
  const { c, linha } = comPagamentoPago();
  const planilha = quebrarGravacaoDoLink(c);
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1, 'o PDF foi criado antes da falha');
  assert.equal(c.celula('Pagamentos', linha, 'link_recibo'), '', 'o link não foi gravado');
  assert.ok(c.amb.emails.length >= 1);
  assert.equal(rascunhosForaDaLixeira(c).length, 0);

  planilha.consertar();
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1, 'a repetição NÃO pode criar um segundo PDF');
  assert.equal(c.celula('Pagamentos', linha, 'link_recibo'), `https://exemplo.invalid/${c.drive.pdfsNaPasta()[0].id}`);
  assert.match(c.ultimoAlerta(), /religado/);
  assert.doesNotMatch(textoQuePodeVazar(c), SENSIVEL);

  gerar(c, linha); // e uma terceira vez continua sendo "já tem recibo"
  assert.equal(c.drive.pdfsNaPasta().length, 1);
  assert.match(c.ultimoAlerta(), /já tem recibo/);
});

test('ACHADO P0 (variante): o Drive cria o PDF mas a resposta se perde; a repetição reconcilia', () => {
  const { c, linha } = comPagamentoPago();
  c.drive.falhas.criarArquivoRespostaPerdida = true;
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1);
  assert.equal(c.celula('Pagamentos', linha, 'link_recibo'), '');
  c.drive.falhas.criarArquivoRespostaPerdida = false;
  gerar(c, linha);
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1);
  assert.match(c.celula('Pagamentos', linha, 'link_recibo'), /^https:/);
});

// Fronteiras transacionais: falha em cada passo, estado depois da falha e depois da nova tentativa.
const FRONTEIRAS = [
  { passo: 'copiar o modelo', ligar: (c) => { c.drive.falhas.copiar = true; }, desligar: (c) => { c.drive.falhas.copiar = false; }, pdfsDepoisDaFalha: 0, link: false },
  { passo: 'abrir o documento', ligar: (c) => { c.drive.falhas.abrirDocumento = true; }, desligar: (c) => { c.drive.falhas.abrirDocumento = false; }, pdfsDepoisDaFalha: 0, link: false },
  { passo: 'substituir os campos', ligar: (c) => { c.drive.falhas.trocarCampo = true; }, desligar: (c) => { c.drive.falhas.trocarCampo = false; }, pdfsDepoisDaFalha: 0, link: false },
  { passo: 'salvar o documento', ligar: (c) => { c.drive.falhas.salvarDocumento = true; }, desligar: (c) => { c.drive.falhas.salvarDocumento = false; }, pdfsDepoisDaFalha: 0, link: false },
  { passo: 'exportar o PDF', ligar: (c) => { c.drive.falhas.exportarPdf = true; }, desligar: (c) => { c.drive.falhas.exportarPdf = false; }, pdfsDepoisDaFalha: 0, link: false },
  { passo: 'criar o PDF no Drive (recusado)', ligar: (c) => { c.drive.falhas.criarArquivo = true; }, desligar: (c) => { c.drive.falhas.criarArquivo = false; }, pdfsDepoisDaFalha: 0, link: false },
  { passo: 'criar o PDF no Drive (resposta perdida)', ligar: (c) => { c.drive.falhas.criarArquivoRespostaPerdida = true; }, desligar: (c) => { c.drive.falhas.criarArquivoRespostaPerdida = false; }, pdfsDepoisDaFalha: 1, link: false },
  { passo: 'gravar o link na planilha', ligar: (c) => { c.planilha = quebrarGravacaoDoLink(c); }, desligar: (c) => { c.planilha.consertar(); }, pdfsDepoisDaFalha: 1, link: false },
  // Depois do link gravado, a cópia vai para a lixeira: a falha aí NÃO desfaz o recibo (B4).
  { passo: 'mandar o rascunho para a lixeira', ligar: (c) => { c.drive.falhas.lixeira = true; }, desligar: (c) => { c.drive.falhas.lixeira = false; }, pdfsDepoisDaFalha: 1, link: true },
];

for (const f of FRONTEIRAS) {
  test(`fronteira "${f.passo}": falha e nova tentativa nunca deixam dois recibos para o mesmo pagamento`, () => {
    const { c, linha } = comPagamentoPago();
    f.ligar(c);
    gerar(c, linha);
    assert.equal(c.drive.pdfsNaPasta().length, f.pdfsDepoisDaFalha, 'PDFs depois da falha');
    assert.equal(c.celula('Pagamentos', linha, 'link_recibo') !== '', f.link, 'link depois da falha');
    f.desligar(c);
    gerar(c, linha);
    gerar(c, linha);
    assert.equal(c.drive.pdfsNaPasta().length, 1, 'PDFs depois da nova tentativa');
    assert.match(c.celula('Pagamentos', linha, 'link_recibo'), /^https:/);
    assert.equal(c.linhas('Pagamentos').filter((l) => l[0] === c.celula('Pagamentos', linha, 'id')).length, 1);
  });
}

test('falha em sequência: várias falhas diferentes seguidas de sucesso ainda dão um recibo só', () => {
  const { c, linha } = comPagamentoPago();
  for (const f of FRONTEIRAS.filter((x) => x.passo !== 'mandar o rascunho para a lixeira')) {
    f.ligar(c); gerar(c, linha); f.desligar(c);
    if (c.celula('Pagamentos', linha, 'link_recibo') !== '') break;
  }
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1);
});

test('concorrência: a leitura que decide acontece DEPOIS da trava (outra execução termina enquanto esta espera)', () => {
  const { c, linha } = comPagamentoPago();
  let esperando = true;
  const outra = () => { c.selecionar('Pagamentos', linha); return c.rodar('gerarRecibo(' + linha + ')'); };
  c.amb.contexto.LockService = {
    getScriptLock: () => ({
      tryLock() { if (esperando) { esperando = false; outra(); } return true; }, // a execução A fecha o recibo enquanto B espera a trava
      releaseLock() {},
    }),
  };
  c.selecionar('Pagamentos', linha);
  const r = c.rodar(`gerarRecibo(${linha})`);
  assert.equal(r.jaTinha, true, 'B precisa reler o estado depois da trava e ver o link de A');
  assert.equal(c.drive.pdfsNaPasta().length, 1);
});

test('concorrência: se a trava não vem, nada é criado nem lido para decidir', () => {
  const { c, linha } = comPagamentoPago();
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  gerar(c, linha);
  assert.match(c.ultimoAlerta(), /Outra operação está em andamento/);
  assert.equal(c.drive.pdfsNaPasta().length, 0);
  assert.equal(c.drive.chamadas.length, 0);
});

test('concorrência: a trava é solta mesmo quando a execução falha no meio', () => {
  const { c, linha } = comPagamentoPago();
  let soltou = 0;
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() { soltou++; } }) };
  c.drive.falhas.exportarPdf = true;
  gerar(c, linha);
  assert.equal(soltou, 1);
});

test('identidade: PDF de OUTRO pagamento com o mesmo nome nunca é religado (R5)', () => {
  const { c, linha } = comPagamentoPago();
  const nome = `Recibo-${c.celula('Pagamentos', linha, 'id')}-P9001.pdf`;
  c.drive.arquivos.set('alheio01', { id: 'alheio01', nome, lixeira: false, tipo: 'application/pdf', pasta: 'pasta123', texto: '', conteudo: '', appProperties: { kit_recibo_pagamento: 'PG999999', kit_recibo_paciente: 'P9001' } });
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 2, 'o alheio fica; cria-se o do pagamento certo');
  assert.doesNotMatch(c.celula('Pagamentos', linha, 'link_recibo'), /alheio01/);
});

test('identidade: mesmo pagamento mas outro paciente nas propriedades não é religado (R5)', () => {
  const { c, linha } = comPagamentoPago();
  const id = c.celula('Pagamentos', linha, 'id');
  c.drive.arquivos.set('alheio02', { id: 'alheio02', nome: 'qualquer.pdf', lixeira: false, tipo: 'application/pdf', pasta: 'pasta123', texto: '', conteudo: '', appProperties: { kit_recibo_pagamento: id, kit_recibo_paciente: 'P9002' } });
  gerar(c, linha);
  assert.doesNotMatch(c.celula('Pagamentos', linha, 'link_recibo'), /alheio02/);
});

test('identidade: PDF antigo (sem propriedades) com o nome exato do recibo NÃO é religado às cegas: o kit para e pede conferência (A-20)', () => {
  const { c, linha } = comPagamentoPago();
  const id = c.celula('Pagamentos', linha, 'id');
  c.drive.arquivos.set('antigo01', { id: 'antigo01', nome: `Recibo-${id}-P9001.pdf`, lixeira: false, tipo: 'application/pdf', pasta: 'pasta123', texto: '', conteudo: '' });
  gerar(c, linha);
  assert.match(c.ultimoAlerta(), /não consigo confirmar/);
  assert.equal(c.celula('Pagamentos', linha, 'link_recibo'), '', 'nada foi ligado');
  assert.equal(c.drive.pdfsNaPasta().length, 1, 'nada foi criado: continua só o antigo');
  assert.equal(c.amb.emails.length, 0, 'é problema de uso, não falha do sistema');
  // a nutricionista confere e manda o antigo para a lixeira: aí o recibo novo sai, uma vez só
  c.drive.arquivos.get('antigo01').lixeira = true;
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1);
  assert.notEqual(c.drive.pdfsNaPasta()[0].id, 'antigo01');
  assert.match(c.celula('Pagamentos', linha, 'link_recibo'), /^https:/);
});

test('identidade: arquivo na lixeira não conta (a nutricionista descartou o recibo de propósito)', () => {
  const { c, linha } = comPagamentoPago();
  gerar(c, linha);
  const primeiro = c.drive.pdfsNaPasta()[0];
  primeiro.lixeira = true;
  c.definir('Pagamentos', linha, 'link_recibo', '');
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1);
  assert.notEqual(c.drive.pdfsNaPasta()[0].id, primeiro.id);
});

test('identidade: dois PDFs ativos do mesmo pagamento => para, não liga nenhum e não cria um terceiro', () => {
  const { c, linha } = comPagamentoPago();
  const id = c.celula('Pagamentos', linha, 'id');
  for (const n of ['a1', 'a2']) c.drive.arquivos.set(n, { id: n, nome: `Recibo-${id}-P9001.pdf`, lixeira: false, tipo: 'application/pdf', pasta: 'pasta123', texto: '', conteudo: '', appProperties: { kit_recibo_pagamento: id, kit_recibo_paciente: 'P9001' } });
  gerar(c, linha);
  assert.match(c.ultimoAlerta(), /Já existem 2 PDFs/);
  assert.equal(c.celula('Pagamentos', linha, 'link_recibo'), '');
  assert.equal(c.drive.pdfsNaPasta().length, 2);
  assert.equal(c.amb.emails.length, 0, 'é problema de uso, não falha do sistema');
});

test('o PDF criado leva a identidade do pagamento e do paciente nas propriedades do arquivo, sem nome nem CPF', () => {
  const { c, linha } = comPagamentoPago();
  gerar(c, linha);
  const pdf = c.drive.pdfsNaPasta()[0];
  assert.deepEqual(pdf.appProperties, {
    kit_recibo_pagamento: c.celula('Pagamentos', linha, 'id'),
    kit_recibo_paciente: 'P9001',
    kit_recibo_conteudo: `${c.celula('Pagamentos', linha, 'valor_centavos')}|${c.celula('Pagamentos', linha, 'data_pagamento')}|pix`,
  });
  assert.match(pdf.appProperties.kit_recibo_conteudo, /^\d+\|\d{4}-\d{2}-\d{2}\|pix$/, 'só valor, data e forma: nada que identifique a pessoa');
  assert.doesNotMatch(JSON.stringify(pdf.appProperties), SENSIVEL);
});

test('a linha do pagamento mudou durante a reconciliação: o link não é gravado na linha errada', () => {
  const { c, linha } = comPagamentoPago();
  c.drive.falhas.criarArquivoRespostaPerdida = true;
  gerar(c, linha);
  c.drive.falhas.criarArquivoRespostaPerdida = false;
  // enquanto o kit trabalha, alguém insere uma linha antes: a conferência de identidade tem de barrar
  const aba = c.amb.abas.get('Pagamentos');
  const original = aba.getRange.bind(aba);
  let inserido = false;
  aba.getRange = (l, col, nl, nc) => {
    if (!inserido && nl === 1 && nc === aba.linhas[0].length && l === linha) { inserido = true; aba.linhas.splice(linha - 1, 0, aba.linhas[0].map(() => 'X')); }
    return original(l, col, nl, nc);
  };
  gerar(c, linha);
  aba.getRange = original;
  const iLink = aba.linhas[0].indexOf('link_recibo');
  assert.ok(aba.linhas.every((l, i) => i === 0 || l[0] === 'X' || l[iLink] === ''), 'nenhuma linha de pagamento recebeu link');
  assert.equal(aba.linhas[linha - 1][iLink], 'X', 'a linha inserida não foi tocada');
  assert.match(c.ultimoAlerta(), /mudou enquanto o kit trabalhava/);
  assert.equal(c.drive.pdfsNaPasta().length, 1);
});

// ---------- A-20: o PDF de uma tentativa anterior só é religado se ainda disser o mesmo que o pagamento diz hoje ----------

// Último pagamento da planilha (o único cujo número a planilha reaproveita se a linha for apagada, A-07), já pago em Pix.
function comUltimoPagamentoPago() {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  c.rodar('gerarAReceber()');
  const linha = c.amb.abas.get('Pagamentos').linhas.length;
  c.selecionar('Pagamentos', linha);
  c.rodar('marcarPagoPix()');
  c.definir('Pagamentos', linha, 'pagador_nome', 'Maria Souza Teste');
  c.definir('Pagamentos', linha, 'pagador_cpf', '52998224725');
  return { c, linha };
}

test('A-20: número de pagamento reaproveitado depois de apagar a última linha NÃO religa o PDF do pagamento apagado', () => {
  const { c, linha } = comUltimoPagamentoPago();
  const id = c.celula('Pagamentos', linha, 'id');
  gerar(c, linha);
  const antigo = c.drive.pdfsNaPasta().find((a) => a.appProperties.kit_recibo_pagamento === id);
  assert.ok(antigo, 'o recibo do pagamento original existe');
  // a nutricionista apaga a última linha de Pagamentos (era um engano) e gera as cobranças de novo: o número volta
  c.amb.abas.get('Pagamentos').deleteRow(linha);
  c.rodar('gerarAReceber()');
  const novaLinha = c.linhaOnde('Pagamentos', 'id', id);
  assert.ok(novaLinha, 'o número foi reaproveitado (A-07 continua como está)');
  c.selecionar('Pagamentos', novaLinha);
  c.rodar('marcarPagoCartao()');
  c.definir('Pagamentos', novaLinha, 'valor_centavos', 20000);
  c.definir('Pagamentos', novaLinha, 'pagador_nome', 'Maria Souza Teste');
  const antes = c.drive.pdfsNaPasta().length;
  gerar(c, novaLinha);
  assert.match(c.ultimoAlerta(), /não consigo confirmar/);
  assert.equal(c.celula('Pagamentos', novaLinha, 'link_recibo'), '', 'o recibo antigo (outro valor e outra forma) não foi ligado ao pagamento novo');
  assert.equal(c.drive.pdfsNaPasta().length, antes, 'nada foi criado nem apagado');
  assert.doesNotMatch(textoQuePodeVazar(c), SENSIVEL);
  // depois da conferência (PDF antigo para a lixeira), o recibo certo sai, uma vez só
  antigo.lixeira = true;
  gerar(c, novaLinha);
  assert.equal(c.drive.pdfsNaPasta().length, 1);
  assert.equal(c.drive.pdfsNaPasta()[0].appProperties.kit_recibo_conteudo, `20000|${c.celula('Pagamentos', novaLinha, 'data_pagamento')}|cartao`);
});

test('A-20: falha parcial e retry sem mudar nada continua religando (a correção do eliminador não regride)', () => {
  const { c, linha } = comUltimoPagamentoPago();
  const quebra = quebrarGravacaoDoLink(c);
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1, 'o PDF ficou, o link não');
  quebra.consertar();
  gerar(c, linha);
  assert.equal(c.drive.pdfsNaPasta().length, 1, 'o retry não cria segundo PDF');
  assert.match(c.celula('Pagamentos', linha, 'link_recibo'), /^https:/);
});

test('A-20: falha parcial, valor corrigido antes do retry: o PDF antigo mostra o valor velho, então o kit para em vez de ligá-lo', () => {
  const { c, linha } = comUltimoPagamentoPago();
  const quebra = quebrarGravacaoDoLink(c);
  gerar(c, linha);
  quebra.consertar();
  c.definir('Pagamentos', linha, 'valor_centavos', 17500);
  gerar(c, linha);
  assert.match(c.ultimoAlerta(), /não consigo confirmar/);
  assert.equal(c.celula('Pagamentos', linha, 'link_recibo'), '');
  assert.equal(c.drive.pdfsNaPasta().length, 1);
});

test('A-20: escolherReciboExistente separa "um que confere", "um que diverge", "vários" e "nenhum"', () => {
  const R = require('../src/Recibo.js');
  const pg = { id: 'PG000007', codigo_paciente: 'P9001', valor_centavos: 15000, data_pagamento: '2026-09-30', forma: 'pix' };
  const base = { name: 'x.pdf', appProperties: R.propriedadesDoRecibo(pg) };
  assert.equal(R.escolherReciboExistente([base], pg).situacao, 'um');
  for (const mudanca of [{ valor_centavos: 15001 }, { data_pagamento: '2026-10-01' }, { forma: 'cartao' }]) {
    assert.equal(R.escolherReciboExistente([base], { ...pg, ...mudanca }).situacao, 'divergente', JSON.stringify(mudanca));
  }
  const semImpressao = { name: 'x.pdf', appProperties: { kit_recibo_pagamento: 'PG000007', kit_recibo_paciente: 'P9001' } };
  assert.equal(R.escolherReciboExistente([semImpressao], pg).situacao, 'divergente', 'identidade sem impressão (versão antiga) não basta');
  assert.equal(R.escolherReciboExistente([base, { ...base, name: 'y.pdf' }], pg).situacao, 'varios');
  assert.equal(R.escolherReciboExistente([{ name: 'Recibo-PG000007-P9001.pdf', appProperties: {} }], pg).situacao, 'divergente', 'só o nome não prova o conteúdo');
  assert.equal(R.escolherReciboExistente([{ name: 'Recibo-PG000007-P9001.pdf' }], pg).situacao, 'divergente', 'o Drive pode devolver o arquivo sem o campo appProperties');
  assert.equal(R.escolherReciboExistente([], pg).situacao, 'nenhum');
  assert.equal(R.impressaoDoRecibo(pg), '15000|2026-09-30|pix');
});
