// Gate B (P1): criar modelo e pasta de recibos não pode duplicar por falha parcial nem por execução simultânea.
// Só dados inventados. Google simulado (E2).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio } = require('./apoio/fluxo.js');

function semModeloNemPasta() {
  const c = criarConsultorio();
  const cfg = c.amb.abas.get('Configurações').linhas;
  for (const l of cfg) if (l[0] === 'id_modelo_recibo' || l[0] === 'id_pasta_recibos') l[1] = '';
  const valor = (k) => cfg.find((l) => l[0] === k)[1];
  const ativos = (papel) => [...c.drive.arquivos.values()].filter((a) => a.appProperties && a.appProperties.kit_papel === papel && !a.lixeira);
  return { c, cfg, valor, ativos };
}

// Faz a gravação de um id em Configurações falhar (a planilha recusa a escrita na coluna B daquela chave).
function quebrarGravacaoEmConfiguracoes(c, chave) {
  const aba = c.amb.abas.get('Configurações');
  const original = aba.getRange.bind(aba);
  let ligado = true;
  aba.getRange = (linha, coluna, nl, nc) => {
    const r = original(linha, coluna, nl, nc);
    if (ligado && coluna === 2 && aba.linhas[linha - 1] && aba.linhas[linha - 1][0] === chave) {
      return { ...r, setValues() { throw new Error('Falha ao gravar: EXCECAO_FICTICIA_CONFIG_001'); } };
    }
    return r;
  };
  return { consertar() { ligado = false; } };
}

test('repetir criar modelo e pasta não cria outros (id preenchido) e usa uma só trava por execução', () => {
  const { c, valor, ativos } = semModeloNemPasta();
  c.rodar('criarModeloEPastaDeRecibos()');
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.equal(ativos('modelo_recibo').length, 1);
  assert.equal(ativos('pasta_recibos').length, 1);
  assert.equal(valor('id_modelo_recibo'), ativos('modelo_recibo')[0].id);
  assert.equal(valor('id_pasta_recibos'), ativos('pasta_recibos')[0].id);
});

test('concorrência: a segunda execução, que esperava a trava, relê as Configurações e não cria outro modelo nem outra pasta', () => {
  const { c, valor, ativos } = semModeloNemPasta();
  let esperando = true;
  c.amb.contexto.LockService = {
    getScriptLock: () => ({ tryLock() { if (esperando) { esperando = false; c.rodar('criarModeloEPastaDeRecibos()'); } return true; }, releaseLock() {} }),
  };
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.equal(ativos('modelo_recibo').length, 1, 'dois modelos A e B');
  assert.equal(ativos('pasta_recibos').length, 1, 'duas pastas A e B');
  assert.ok(valor('id_modelo_recibo') && valor('id_pasta_recibos'));
  assert.match(c.ultimoAlerta(), /já estão configurados/);
});

test('sem trava, nada é criado', () => {
  const { c, ativos } = semModeloNemPasta();
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.match(c.ultimoAlerta(), /Outra operação está em andamento/);
  assert.equal(ativos('modelo_recibo').length + ativos('pasta_recibos').length, 0);
});

for (const [chave, papel] of [['id_modelo_recibo', 'modelo_recibo'], ['id_pasta_recibos', 'pasta_recibos']]) {
  test(`falha ao gravar ${chave} depois de criar o arquivo: a nova tentativa reaproveita, sem segundo arquivo`, () => {
    const { c, valor, ativos } = semModeloNemPasta();
    const planilha = quebrarGravacaoEmConfiguracoes(c, chave);
    c.rodar('criarModeloEPastaDeRecibos()');
    assert.equal(ativos(papel).length, 1, 'o arquivo foi criado antes da falha');
    assert.equal(valor(chave), '');
    planilha.consertar();
    c.rodar('criarModeloEPastaDeRecibos()');
    c.rodar('criarModeloEPastaDeRecibos()');
    assert.equal(ativos(papel).length, 1, 'nova tentativa NÃO pode criar o segundo');
    assert.equal(valor(chave), ativos(papel)[0].id);
  });
}

test('falha ao criar o arquivo: nada fica pela metade e a nova tentativa cria um só', () => {
  const { c, ativos } = semModeloNemPasta();
  c.drive.falhas.criarPapel = true;
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.equal(ativos('modelo_recibo').length + ativos('pasta_recibos').length, 0);
  c.drive.falhas.criarPapel = false;
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.equal(ativos('modelo_recibo').length, 1);
  assert.equal(ativos('pasta_recibos').length, 1);
});

test('dois modelos já existentes e nenhum configurado: para sem escolher nem criar um terceiro', () => {
  const { c, valor, ativos } = semModeloNemPasta();
  for (const n of ['m1', 'm2']) c.drive.arquivos.set(n, { id: n, nome: 'modelo', lixeira: false, appProperties: { kit_papel: 'modelo_recibo' } });
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.match(c.ultimoAlerta(), /Já existem 2 modelos/);
  assert.equal(valor('id_modelo_recibo'), '');
  assert.equal(ativos('modelo_recibo').length, 2);
});

test('modelo na lixeira não é reaproveitado', () => {
  const { c, valor, ativos } = semModeloNemPasta();
  c.drive.arquivos.set('velho', { id: 'velho', nome: 'modelo', lixeira: true, appProperties: { kit_papel: 'modelo_recibo' } });
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.notEqual(valor('id_modelo_recibo'), 'velho');
  assert.equal(ativos('modelo_recibo').length, 1);
});

test('id guardado como número ou linha repetida em Configurações: recusa, em vez de criar outro e sobrescrever', () => {
  const { c, cfg, ativos } = semModeloNemPasta();
  cfg.find((l) => l[0] === 'id_modelo_recibo')[1] = 12345;
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.match(c.ultimoAlerta(), /"id_modelo_recibo" está repetida ou com um valor/);
  assert.equal(ativos('modelo_recibo').length, 0);
  cfg.find((l) => l[0] === 'id_modelo_recibo')[1] = '';
  cfg.push(['id_pasta_recibos', 'outra']);
  c.rodar('criarModeloEPastaDeRecibos()');
  assert.match(c.ultimoAlerta(), /"id_pasta_recibos" está repetida/);
});
