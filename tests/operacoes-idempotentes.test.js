// Gate B: instalação e gatilho repetidos ou simultâneos não duplicam nada (item 10 do roteiro; docs/MATRIZ-INTEGRIDADE.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio } = require('./apoio/fluxo.js');

test('ativar a sincronização automática duas vezes e em paralelo deixa um único gatilho', () => {
  const c = criarConsultorio();
  let esperando = true;
  c.amb.contexto.LockService = {
    getScriptLock: () => ({ tryLock() { if (esperando) { esperando = false; c.rodar('ativarSincronizacaoAutomatica()'); } return true; }, releaseLock() {} }),
  };
  c.rodar('ativarSincronizacaoAutomatica()');
  c.rodar('ativarSincronizacaoAutomatica()');
  assert.equal(c.amb.contexto.ScriptApp.triggers.length, 1);
});

test('ativar a sincronização sem conseguir a trava não cria gatilho', () => {
  const c = criarConsultorio();
  c.amb.contexto.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  c.rodar('ativarSincronizacaoAutomatica()');
  assert.equal(c.amb.contexto.ScriptApp.triggers.length, 0);
});

test('instalar a planilha em paralelo e repetido não duplica abas nem chaves de configuração', () => {
  const c = criarConsultorio({ configuracoes: [] });
  const abas = () => [...c.amb.abas.keys()].sort();
  c.rodar('instalarPlanilha()');
  const depois = abas();
  const chaves = c.linhas('Configurações').length;
  let esperando = true;
  c.amb.contexto.LockService = {
    getScriptLock: () => ({ tryLock() { if (esperando) { esperando = false; c.rodar('instalarPlanilha()'); } return true; }, releaseLock() {} }),
  };
  c.rodar('instalarPlanilha()');
  assert.deepEqual(abas(), depois);
  assert.equal(c.linhas('Configurações').length, chaves);
  assert.equal(new Set(c.linhas('Configurações').map((l) => l[0])).size, chaves);
});

test('sincronizar a agenda duas vezes e em paralelo não duplica consultas', () => {
  const c = criarConsultorio();
  let esperando = true;
  c.amb.contexto.LockService = {
    getScriptLock: () => ({ tryLock() { if (esperando) { esperando = false; c.rodar('sincronizarAgenda()'); } return true; }, releaseLock() {} }),
  };
  c.rodar('sincronizarAgenda()');
  const ids = c.linhas('Consultas').map((l) => l[0]);
  assert.equal(new Set(ids).size, ids.length);
  c.rodar('sincronizarAgenda()');
  assert.equal(c.linhas('Consultas').length, ids.length);
});

test('gerar a receber duas vezes e em paralelo: uma cobrança por consulta, ids de pagamento únicos', () => {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  let esperando = true;
  c.amb.contexto.LockService = {
    getScriptLock: () => ({ tryLock() { if (esperando) { esperando = false; c.rodar('gerarAReceber()'); } return true; }, releaseLock() {} }),
  };
  c.rodar('gerarAReceber()');
  c.rodar('gerarAReceber()');
  const pag = c.linhas('Pagamentos');
  assert.equal(new Set(pag.map((l) => l[0])).size, pag.length, 'id de pagamento repetido');
  assert.equal(new Set(pag.map((l) => l[1])).size, pag.length, 'duas cobranças para a mesma consulta');
});
