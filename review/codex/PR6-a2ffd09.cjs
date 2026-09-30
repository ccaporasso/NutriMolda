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
test('R03i: linha com origem vazia e id reservado não autoriza apagar consulta nem pagamento', () => {
  const a = ambiente();
  // Linha de versão antiga (sem agenda_origem), última sincronização de outra agenda.
  // O instalador só completa o cabeçalho; não fabrica prova de criação pelo gerador.
  a.propriedades.set('calendario_da_ultima_sincronizacao', 'agenda-anterior@group.calendar.google.com');
  a.abas.get('Consultas').linhas.push([D.idEventoTeste(0), '2026-09-30', '09:00', 'primeira', 'P0001', 'marcada', '', '']);
  a.abas.get('Pagamentos').linhas.push(['PG000001', D.idEventoTeste(0), 'P0001', '', '', 15000, '', 'a_receber', '', '', '']);
  a.contexto.Calendar.Events.list = () => ({ items: [] });
  a.contexto.Calendar.Events.remove = () => {};
  a.rodar('apagarDadosDeTeste()');
  assert.deepEqual({ consultas: a.abas.get('Consultas').linhas.length, pagamentos: a.abas.get('Pagamentos').linhas.length },
    { consultas: 2, pagamentos: 2 }, 'Consulta e pagamento sem prova de origem devem ser preservados');
});
test('CONTROLE: origem explícita da agenda atual mantém a limpeza dos registros comprovados', () => {
  const a = ambiente();
  const origem = a.rodar(`marcaDaAgenda(${JSON.stringify(idAgenda)})`);
  a.abas.get('Consultas').linhas.push([D.idEventoTeste(0), '2026-09-30', '09:00', 'primeira', 'P9001', 'marcada', '', origem]);
  a.abas.get('Pagamentos').linhas.push(['PG000001', D.idEventoTeste(0), 'P9001', '', '', 15000, '', 'a_receber', '', '', '']);
  a.contexto.Calendar.Events.list = () => ({ items: [] });
  a.contexto.Calendar.Events.remove = () => {};
  a.rodar('apagarDadosDeTeste()');
  assert.equal(a.abas.get('Consultas').linhas.length, 1);
  assert.equal(a.abas.get('Pagamentos').linhas.length, 1);
});
test('R03k: falha de leitura da agenda não equivale a ausência e não permite primeiras escritas', () => {
  const a = ambiente();
  a.contexto.Calendar.Events.get = () => { throw new Error('Quota exceeded ficticio'); };
  const writes = [];
  a.contexto.Calendar.Events.insert = (...args) => writes.push(args);
  a.contexto.Calendar.Events.update = (...args) => writes.push(args);
  try { a.rodar('criarDadosDeTeste()'); } catch (_) {}
  assert.deepEqual({ escritasAgenda: writes.length, linhasPacientes: a.abas.get('Pacientes').linhas.length },
    { escritasAgenda: 0, linhasPacientes: 1 }, 'Falha de pré-checagem não permite escrever pacientes nem eventos');
});
