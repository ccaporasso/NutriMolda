// Testa a lógica pura dos dados fictícios (T04) e o gerador contra Google simulado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/DadosTeste.js');

const hoje = { ano: 2026, mes: 9, dia: 30 };

test('pacientes de teste: códigos P9xxx únicos e só dados inventados', () => {
  const codigos = D.PACIENTES_TESTE.map((p) => p.codigo);
  assert.equal(new Set(codigos).size, codigos.length);
  for (const p of D.PACIENTES_TESTE) {
    assert.match(p.codigo, /^P9\d{3}$/);
    assert.match(p.email, /@exemplo\.invalid$/);
    assert.match(p.telefone, /^55119000000\d\d$/);
  }
});

test('eventos: datas relativas, título mínimo, ids válidos e fixos', () => {
  const ev = D.montarEventosTeste(hoje);
  assert.equal(ev.length, D.EVENTOS_TESTE.length);
  assert.equal(ev[0].titulo, 'Consulta — Ana S.');
  assert.equal(ev[0].inicio, '2026-09-09T09:00:00');
  assert.equal(ev[0].fim, '2026-09-09T09:50:00');
  assert.equal(ev[1].inicio, '2026-10-07T09:00:00'); // vira o mês
  assert.deepEqual(D.montarEventosTeste(hoje).map((e) => e.id), ev.map((e) => e.id));
  for (const e of ev) {
    assert.match(e.id, /^[a-v0-9]{5,}$/);
    assert.deepEqual(e.marca, { kit_teste: '1' });
    assert.doesNotMatch(e.titulo + e.descricao, /consulta.*(diabetes|obes|dieta)/i);
  }
  assert.equal(new Set(ev.map((e) => e.id)).size, ev.length);
});

test('há um evento de paciente desconhecido, passado e futuro, primeira e retorno', () => {
  assert.ok(D.EVENTOS_TESTE.some((e) => e.codigo === null));
  assert.ok(D.EVENTOS_TESTE.some((e) => e.deslocamentoDias < 0));
  assert.ok(D.EVENTOS_TESTE.some((e) => e.deslocamentoDias > 0));
  assert.deepEqual([...new Set(D.EVENTOS_TESTE.map((e) => e.tipo))].sort(), ['primeira', 'retorno']);
});

test('trava: agenda principal e ids vazios são recusados', () => {
  for (const id of ['primary', '', undefined, 'alguem@gmail.com']) {
    const r = D.validarAgendaDeTeste(id);
    assert.equal(r.ok, false);
    assert.match(r.erro, /agenda separada/);
  }
  assert.equal(D.validarAgendaDeTeste('abc123@group.calendar.google.com').ok, true);
});

test('pacientesQueFaltam não repete o que já existe', () => {
  assert.equal(D.pacientesQueFaltam([]).length, 6);
  assert.equal(D.pacientesQueFaltam(['P9001', 'P9002']).length, 4);
  assert.equal(D.pacientesQueFaltam(D.PACIENTES_TESTE.map((p) => p.codigo)).length, 0);
});

test('linhasParaApagar pega só P9xxx, de baixo para cima, sem tocar no cabeçalho', () => {
  const coluna = ['codigo', 'P0001', 'P9001', 'P0002', 'P9002', 'P9', 'P90001'];
  assert.deepEqual(D.linhasParaApagar(coluna, D.ehCodigoDeTeste), [5, 3]);
});

// Gerador contra um Google simulado.
function carregarGerador(configuracao) {
  const eventos = new Map();
  const linhasPorAba = { Pacientes: [['codigo'], ['P0001']], Consultas: [['codigo_paciente']], Pagamentos: [['codigo_paciente']], Pacotes: [['codigo_paciente']] };
  const chamadas = [];
  const folhas = {};
  for (const [nome, dados] of Object.entries(linhasPorAba)) {
    folhas[nome] = {
      getLastRow: () => dados.length,
      getRange: (l, c, n = 1, w = 1) => ({
        getValues: () => dados.slice(l - 1, l - 1 + n).map((r) => [r[c - 1]]),
        setValues: (v) => v.forEach((linha, i) => { dados[l - 1 + i] = linha; }),
      }),
      deleteRow: (l) => dados.splice(l - 1, 1),
    };
  }
  const contexto = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (n) => folhas[n] }),
      getUi: () => ({ alert: () => 'OK', ButtonSet: { OK_CANCEL: 1 }, Button: { OK: 'OK' } }),
    },
    Utilities: { formatDate: (d, tz, f) => ({ yyyy: '2026', M: '9', d: '30' })[f] },
    Calendar: {
      Events: {
        get: (cal, id) => { if (!eventos.has(id)) throw new Error('404'); return eventos.get(id); },
        insert: (corpo, cal) => { chamadas.push(['insert', cal]); eventos.set(corpo.id, { ...corpo }); },
        update: (corpo, cal, id) => { chamadas.push(['update', cal]); eventos.set(id, { ...corpo }); },
        remove: (cal, id) => { eventos.get(id).status = 'cancelled'; },
        list: () => ({ items: [...eventos.values()].filter((e) => e.status !== 'cancelled') }),
      },
    },
    lerConfiguracoes: () => ({ config: configuracao }),
  };
  vm.createContext(contexto);
  const codigo = ['Esquema.js', 'DadosTeste.js', 'GeradorTeste.js']
    .map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8').replace(/if \(typeof module[\s\S]*$/, ''))
    .join('\n') + '\n;({ criarDadosDeTeste, apagarDadosDeTeste });';
  const api = vm.runInContext(codigo, contexto);
  return { api, eventos, dados: linhasPorAba, chamadas };
}

const CAL = 'teste123@group.calendar.google.com';

test('gerador: criar duas vezes não duplica; apagar remove só dados de teste', () => {
  const { api, eventos, dados } = carregarGerador({ calendario_id: CAL, prefixo_evento_consulta: 'Consulta' });
  api.criarDadosDeTeste();
  api.criarDadosDeTeste();
  assert.equal(eventos.size, 9);
  assert.equal(dados.Pacientes.length, 1 + 1 + 6); // cabeçalho + P0001 + 6 de teste
  api.apagarDadosDeTeste();
  assert.deepEqual(dados.Pacientes, [['codigo'], ['P0001']]);
  assert.equal([...eventos.values()].filter((e) => e.status !== 'cancelled').length, 0);
  api.criarDadosDeTeste(); // recria depois de apagar
  assert.equal([...eventos.values()].filter((e) => e.status !== 'cancelled').length, 9);
});

test('gerador: recusa agenda principal antes de tocar em qualquer coisa', () => {
  const { api, eventos, dados } = carregarGerador({ calendario_id: 'primary' });
  assert.throws(() => api.criarDadosDeTeste(), /agenda separada/);
  assert.throws(() => api.apagarDadosDeTeste(), /agenda separada/);
  assert.equal(eventos.size, 0);
  assert.equal(dados.Pacientes.length, 2);
});
