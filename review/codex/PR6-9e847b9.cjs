// Origem de teste deve ser comprovada; erros de leitura devem impedir escrita. Só Google em memória.
// Execute da raiz do snapshot: node --test --test-isolation=none --test-reporter=spec <arquivo>
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(process.env.NUTRIMOLDA_REVIEW_ROOT || process.cwd());
const D = require(path.join(root, 'src/DadosTeste.js'));
const { criarAmbiente } = require(path.join(root, 'tests/apoio/simulacao.js'));
const { CONFIG_COMPLETA } = require(path.join(root, 'tests/apoio/fluxo.js'));
const idAgenda = 'agenda-teste@group.calendar.google.com';
function ambiente() {
  const cfg = CONFIG_COMPLETA.map(l => l.slice());
  cfg.find(l => l[0] === 'calendario_id')[1] = idAgenda;
  const a = criarAmbiente({ configuracoes: cfg });
  a.carregar(...fs.readdirSync(path.join(root, 'src')).filter(n => n.endsWith('.js')).sort());
  return a;
}
test('R03l: pagamento com id compartilhado por consulta comprovada e legada deve ser preservado', () => {
  const a = ambiente();
  const origem = a.rodar(`marcaDaAgenda(${JSON.stringify(idAgenda)})`);
  const id = D.idEventoTeste(0);
  // Estado possível em planilha antiga, antes do bloqueio de colisão entre agendas.
  a.abas.get('Consultas').linhas.push([id, '2026-09-30', '09:00', 'primeira', 'P9001', 'marcada', '', origem]);
  a.abas.get('Consultas').linhas.push([id, '2026-09-20', '09:00', 'primeira', 'P0001', 'marcada', '', '']);
  a.abas.get('Pagamentos').linhas.push(['PG000001', id, 'P0001', '', '', 15000, 'pix', 'pago', '2026-09-20', '', '']);
  a.contexto.Calendar.Events.list = () => ({items:[]});
  a.contexto.Calendar.Events.remove = () => {};
  a.rodar('apagarDadosDeTeste()');
  assert.equal(a.abas.get('Consultas').linhas.filter(l => l[0] === id).length, 1);
  assert.equal(a.abas.get('Pagamentos').linhas.length, 2,
    'Pagamento da consulta legada sem origem comprovada não deve desaparecer por compartilhar id');
});
test('CONTROLE R03l: id exclusivo com origem comprovada permite apagar pagamento ligado', () => {
  const p = D.planejarLimpezaDeTeste({pacientes:[],
    consultas:[{linha:2,id_evento:D.idEventoTeste(0),origem:'ateste',codigo_paciente:'P9001'}],
    pagamentos:[{linha:2,id_evento:D.idEventoTeste(0),codigo_paciente:'P9001'}],origemTeste:'ateste'});
  assert.deepEqual(p.Pagamentos,[2]);
});
test('CONTROLE R03k: falha depois de quatro ausências confirmadas interrompe sem primeiras escritas', () => {
  for (const msg of ['Quota exceeded ficticio', 'Forbidden', 'Service unavailable']) {
    const a = ambiente(); let reads=0; const writes=[];
    a.contexto.Calendar.Events.get = () => {
      if (++reads === 5) throw new Error(msg);
      throw new Error('API call to calendar.events.get failed with error: Not Found');
    };
    a.contexto.Calendar.Events.insert = (...args) => writes.push(args);
    a.contexto.Calendar.Events.update = (...args) => writes.push(args);
    assert.throws(() => a.rodar('criarDadosDeTeste()'), /Não foi possível conferir/);
    assert.equal(reads,5); assert.equal(writes.length,0);
    assert.equal(a.abas.get('Pacientes').linhas.length,1);
  }
});
test('CONTROLE: criar, repetir, apagar e recriar com prova funciona no Google em memória', () => {
  const a = ambiente(); const eventos = new Map(); let writes=0;
  a.contexto.Calendar.Events.get = (_,id) => {
    if (!eventos.has(id)) throw new Error('API call to calendar.events.get failed with error: Not Found');
    return eventos.get(id);
  };
  a.contexto.Calendar.Events.insert = (e) => { writes++; eventos.set(e.id,e); };
  a.contexto.Calendar.Events.update = (e,_,id) => { writes++; eventos.set(id,e); };
  a.contexto.Calendar.Events.list = () => ({items:[...eventos.values()].filter(e => e.status !== 'cancelled')});
  a.contexto.Calendar.Events.remove = (_,id) => { eventos.set(id,{id,status:'cancelled'}); };
  a.rodar('criarDadosDeTeste()');
  assert.equal(writes,9); assert.equal(a.abas.get('Pacientes').linhas.length,7);
  a.rodar('criarDadosDeTeste()');
  assert.equal(writes,9); assert.equal(a.abas.get('Pacientes').linhas.length,7);
  a.rodar('apagarDadosDeTeste()');
  assert.equal(a.abas.get('Pacientes').linhas.length,1);
  assert.equal([...eventos.values()].filter(e=>e.status==='cancelled').length,9);
  a.rodar('criarDadosDeTeste()');
  assert.equal(writes,18); assert.equal(a.abas.get('Pacientes').linhas.length,7);
});
