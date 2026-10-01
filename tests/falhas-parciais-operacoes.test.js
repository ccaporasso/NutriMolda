// Gate B: falha injetada no meio das operações que ainda não tinham teste de falha parcial (a receber, pagar, cortesia, instalar,
// gatilho). Para cada uma: o que ficou gravado é conhecido, a falha vai ao Registro e ao e-mail sem o texto do erro, e repetir termina
// o serviço sem duplicar nada. O Google é simulado (E2): a atomicidade real do Planilhas é N/M (docs/gate/GOOGLE-REAL.md).
// Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarConsultorio } = require('./apoio/fluxo.js');

const TEXTO_DO_ERRO = 'EXCECAO_FICTICIA_PLANILHA_Maria_Souza_Teste';

// Faz a N-ésima chamada de setValues na aba falhar (e só ela). Devolve { consertar }.
function falharNaEscrita(aba, quando) {
  const original = aba.getRange.bind(aba);
  let n = 0;
  let ligado = true;
  aba.getRange = (...a) => {
    const r = original(...a);
    const setValues = r.setValues;
    r.setValues = (v) => { if (ligado && ++n === quando) throw new Error(TEXTO_DO_ERRO); return setValues(v); };
    return r;
  };
  return { consertar() { ligado = false; } };
}

const semVazar = (c) => {
  const tudo = c.registroTexto() + JSON.stringify(c.amb.emails) + c.amb.alertas.join('\n');
  assert.doesNotMatch(c.registroTexto() + JSON.stringify(c.amb.emails), /Maria_Souza|EXCECAO_FICTICIA/, 'o texto do erro não vai ao Registro nem ao e-mail');
  return tudo;
};

function comAgendaSincronizada() {
  const c = criarConsultorio();
  c.rodar('sincronizarAgenda()');
  return c;
}

test('a receber: falha ao gravar as cobranças não deixa cobrança pela metade; repetir cria cada uma uma vez', () => {
  const c = comAgendaSincronizada();
  const falha = falharNaEscrita(c.amb.abas.get('Pagamentos'), 1);
  c.rodar('gerarAReceberPeloMenu()');
  assert.equal(c.linhas('Pagamentos').length, 0, 'a gravação é uma só: ou grava tudo ou nada');
  assert.match(c.registroTexto(), /Falha no módulo pagamentos/);
  assert.equal(c.amb.emails.length, 1);
  semVazar(c);
  falha.consertar();
  c.rodar('gerarAReceberPeloMenu()');
  const ids = c.linhas('Pagamentos').map((l) => l[0]);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  const eventos = c.linhas('Pagamentos').map((l) => l[c.amb.abas.get('Pagamentos').linhas[0].indexOf('id_evento')]);
  assert.equal(new Set(eventos).size, eventos.length, 'uma cobrança por consulta');
  c.rodar('gerarAReceberPeloMenu()');
  assert.equal(c.linhas('Pagamentos').length, ids.length, 'repetir de novo não cria nada');
});

test('marcar pago em três linhas, falha na segunda gravação: a primeira fica paga, as outras continuam a receber; repetir termina sem pagar duas vezes', () => {
  const c = comAgendaSincronizada();
  c.rodar('gerarAReceber()');
  const aba = c.amb.abas.get('Pagamentos');
  const status = () => c.linhas('Pagamentos').slice(0, 3).map((l) => l[aba.linhas[0].indexOf('status')]);
  const datas = () => c.linhas('Pagamentos').slice(0, 3).map((l) => l[aba.linhas[0].indexOf('data_pagamento')]);
  c.selecionar('Pagamentos', 2, 3, 4);
  const falha = falharNaEscrita(aba, 2);
  c.rodar('marcarPagoPix()');
  assert.deepEqual(status(), ['pago', 'a_receber', 'a_receber']);
  assert.match(c.registroTexto(), /Falha no módulo/);
  semVazar(c);
  falha.consertar();
  const dataDaPrimeira = datas()[0];
  c.selecionar('Pagamentos', 2, 3, 4);
  c.rodar('marcarPagoPix()');
  assert.deepEqual(status(), ['pago', 'pago', 'pago']);
  assert.equal(datas()[0], dataDaPrimeira, 'a linha que já estava paga não foi regravada');
  assert.match(c.ultimoAlerta(), /já está pago/, 'a repetição avisa da linha que já estava paga e não a remarca');
});

test('cortesia: falha ao gravar não muda o status nem o valor; repetir faz a cortesia', () => {
  const c = comAgendaSincronizada();
  c.rodar('gerarAReceber()');
  const aba = c.amb.abas.get('Pagamentos');
  const cab = aba.linhas[0];
  const antes = aba.linhas[1].slice();
  c.selecionar('Pagamentos', 2);
  const falha = falharNaEscrita(aba, 1);
  c.rodar('marcarCortesia()');
  assert.deepEqual(aba.linhas[1], antes, 'a linha continua exatamente como estava');
  assert.match(c.registroTexto(), /Falha no módulo/);
  semVazar(c);
  falha.consertar();
  c.selecionar('Pagamentos', 2);
  c.rodar('marcarCortesia()');
  assert.equal(aba.linhas[1][cab.indexOf('status')], 'cortesia');
  assert.equal(Number(aba.linhas[1][cab.indexOf('valor_centavos')]), 0);
});

test('instalar: falha ao criar a segunda aba que falta deixa a primeira criada; repetir completa e não duplica', () => {
  const c = criarConsultorio();
  const { ABAS } = require('../src/Esquema.js');
  c.amb.abas.delete('Pacotes');
  c.amb.abas.delete('Despesas');
  const planilha = c.amb.planilha;
  const insertOriginal = planilha.insertSheet;
  let criadas = 0;
  planilha.insertSheet = (nome) => { if (++criadas === 2) throw new Error(TEXTO_DO_ERRO); return insertOriginal(nome); };
  c.rodar('instalarPlanilha()');
  assert.equal(c.amb.abas.size, ABAS.length - 1, 'uma das duas abas foi criada');
  assert.match(c.registroTexto(), /Falha no módulo instalador/);
  semVazar(c);
  planilha.insertSheet = insertOriginal;
  c.rodar('instalarPlanilha()');
  assert.equal(c.amb.abas.size, ABAS.length, 'todas as abas existem');
  assert.equal(planilha.getSheets().length, ABAS.length, 'nenhuma aba duplicada');
  const configuracoes = c.linhas('Configurações').map((l) => l[0]);
  assert.equal(new Set(configuracoes).size, configuracoes.length, 'nenhuma chave de configuração repetida');
  c.rodar('instalarPlanilha()');
  assert.equal(planilha.getSheets().length, ABAS.length, 'uma terceira vez não muda nada');
});

test('gatilho automático: falha ao criar não deixa gatilho; repetir cria um só; mais uma vez não cria outro', () => {
  const c = criarConsultorio();
  const real = c.amb.contexto.ScriptApp;
  let falhar = true;
  c.amb.contexto.ScriptApp = {
    getProjectTriggers: () => real.getProjectTriggers(),
    newTrigger: (f) => {
      const b = real.newTrigger(f);
      const cria = b.create;
      return { timeBased: () => ({ everyHours: () => ({ create: () => { if (falhar) throw new Error(TEXTO_DO_ERRO); return real.newTrigger(f).timeBased().everyHours(1).create(); } }) }) , create: cria };
    },
  };
  c.rodar('ativarSincronizacaoAutomatica()');
  assert.equal(real.getProjectTriggers().length, 0);
  assert.match(c.registroTexto(), /Falha no módulo sincronizacao/);
  semVazar(c);
  falhar = false;
  c.rodar('ativarSincronizacaoAutomatica()');
  assert.equal(real.getProjectTriggers().length, 1);
  c.rodar('ativarSincronizacaoAutomatica()');
  assert.equal(real.getProjectTriggers().length, 1, 'nunca dois gatilhos');
});

// ---------- concorrência nas ações de pagamento: a execução que espera a trava relê o estado depois de obtê-la ----------

function comDuasExecucoes(c, linha, outraAcao) {
  let esperando = true;
  c.amb.contexto.LockService = {
    getScriptLock: () => ({
      tryLock() { // enquanto a execução A espera a trava, a execução B faz a sua ação inteira
        if (esperando) { esperando = false; c.selecionar('Pagamentos', linha); c.rodar(outraAcao); }
        return true;
      },
      releaseLock() {},
    }),
  };
}

test('marcar pago: a execução que esperava a trava relê e não remarca o que a outra já pagou', () => {
  const c = comAgendaSincronizada();
  c.rodar('gerarAReceber()');
  const aba = c.amb.abas.get('Pagamentos');
  const cab = aba.linhas[0];
  comDuasExecucoes(c, 2, 'marcarPagoCartao()');
  c.selecionar('Pagamentos', 2);
  c.rodar('marcarPagoPix()');
  assert.equal(aba.linhas[1][cab.indexOf('forma')], 'cartao', 'vale a execução que chegou primeiro; a outra não sobrescreve');
  assert.equal(aba.linhas[1][cab.indexOf('status')], 'pago');
  assert.match(c.ultimoAlerta(), /já está pago/);
});

test('cortesia: se a outra execução já recebeu o pagamento, a cortesia não zera o valor recebido', () => {
  const c = comAgendaSincronizada();
  c.rodar('gerarAReceber()');
  const aba = c.amb.abas.get('Pagamentos');
  const cab = aba.linhas[0];
  const valor = Number(aba.linhas[1][cab.indexOf('valor_centavos')]);
  assert.ok(valor > 0);
  comDuasExecucoes(c, 2, 'marcarPagoPix()');
  c.selecionar('Pagamentos', 2);
  c.rodar('marcarCortesia()');
  assert.equal(aba.linhas[1][cab.indexOf('status')], 'pago');
  assert.equal(Number(aba.linhas[1][cab.indexOf('valor_centavos')]), valor, 'o valor recebido continua');
  assert.match(c.ultimoAlerta(), /não pode virar cortesia/);
});
