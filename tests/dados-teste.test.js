// Testa a lógica pura dos dados fictícios (T04) e o gerador contra Google simulado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/DadosTeste.js');
const { criarAmbiente } = require('./apoio/simulacao.js');

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
  for (const id of ['primary', '', undefined, 'alguem@exemplo.invalid']) {
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

test('planejarLimpezaDeTeste pega só o que tem prova de vir do gerador, de baixo para cima (R03)', () => {
  const ger = D.PACIENTES_TESTE[0];
  const pacientes = [
    { linha: 2, codigo: 'P0001', email: 'real@exemplo.invalid' },
    { linha: 3, codigo: ger.codigo, email: ger.email },
    { linha: 4, codigo: 'P9500', email: 'outra@exemplo.invalid' }, // começa com P9, mas não é do gerador
  ];
  const consultas = [
    { linha: 2, id_evento: 'abc', codigo_paciente: 'P0001' },
    { linha: 3, id_evento: D.idEventoTeste(0), codigo_paciente: ger.codigo, origem: 'ateste' },
    { linha: 4, id_evento: D.idEventoTeste(8), codigo_paciente: '', origem: 'ateste' }, // a identificar
    { linha: 5, id_evento: 'xyz', codigo_paciente: 'P9500' },
    { linha: 6, id_evento: 'eventoalheio', codigo_paciente: ger.codigo }, // do mesmo paciente de teste, mas não é evento gerado
    { linha: 7, id_evento: 'kittestealheio', codigo_paciente: '' }, // prefixo parecido não vale
  ];
  const pagamentos = [
    { linha: 2, id_evento: 'abc', codigo_paciente: 'P0001' },
    { linha: 3, id_evento: D.idEventoTeste(8), codigo_paciente: '' },
    { linha: 4, id_evento: 'xyz', codigo_paciente: 'P9500' },
    { linha: 5, id_evento: 'eventoalheio', codigo_paciente: ger.codigo },
  ];
  const plano = D.planejarLimpezaDeTeste({ pacientes, consultas, pagamentos, pacotes: [{ linha: 2, codigo_paciente: 'P9500' }, { linha: 3, codigo_paciente: ger.codigo }], origemTeste: 'ateste' });
  assert.deepEqual(plano, { Pacientes: [3], Consultas: [4, 3], Pagamentos: [3], Pacotes: [] }); // pacote nunca é apagado: o gerador não o cria
});

test('R03f/R03g: consulta de teste de outra agenda e pacote sem prova de origem são preservados', () => {
  const ger = D.PACIENTES_TESTE[0];
  const plano = D.planejarLimpezaDeTeste({
    pacientes: [{ linha: 2, codigo: ger.codigo, email: ger.email }],
    consultas: [{ linha: 2, id_evento: D.idEventoTeste(0), codigo_paciente: ger.codigo, origem: 'aalheia' }, { linha: 3, id_evento: D.idEventoTeste(1), codigo_paciente: ger.codigo, origem: 'ateste' }],
    pagamentos: [{ linha: 2, id_evento: D.idEventoTeste(0) }, { linha: 3, id_evento: D.idEventoTeste(1) }],
    pacotes: [{ linha: 2, codigo_paciente: ger.codigo, total_consultas: 99, usadas: 3 }], origemTeste: 'ateste',
  });
  assert.deepEqual(plano, { Pacientes: [2], Consultas: [3], Pagamentos: [3], Pacotes: [] });
});

test('R03h: evento com id ocupado sem prova de origem recusa a criação antes de escrever qualquer coisa', () => {
  const { api, eventos, dados, amb } = carregarGerador({ calendario_id: CAL });
  amb.contexto.Calendar.Events.get = (cal, id) => { if (id === D.idEventoTeste(0)) return { id, status: 'cancelled' }; throw new Error('Not Found'); };
  const escritos = [];
  amb.contexto.Calendar.Events.update = (...a) => escritos.push(a);
  amb.contexto.Calendar.Events.insert = (...a) => escritos.push(a);
  assert.throws(() => api.criarDadosDeTeste(), /não há prova/);
  assert.equal(escritos.length, 0);
  assert.equal(dados.Pacientes.length, 2);
  assert.equal(eventos.size, 0);
});

test('R03c/R03d/R03e: código reservado sem prova de origem não autoriza apagar; prefixo parecido não é evento gerado', () => {
  const p = D.planejarLimpezaDeTeste({
    pacientes: [], consultas: [{ linha: 2, id_evento: 'eventoalheio', codigo_paciente: 'P9001' }],
    pagamentos: [{ linha: 2, id_evento: 'eventoalheio', codigo_paciente: 'P9001' }], pacotes: [{ linha: 2, codigo_paciente: 'P9001' }],
  });
  assert.deepEqual(p, { Pacientes: [], Consultas: [], Pagamentos: [], Pacotes: [] });
  assert.equal(D.idEventoEhDeTeste('kittestealheio'), false);
  assert.equal(D.idEventoEhDeTeste(D.idEventoTeste(3)), true);
});

test('código de teste já usado com outros dados é colisão: nada dele é apagado', () => {
  const pacientes = [{ linha: 2, codigo: 'P9001', email: 'outra.pessoa@exemplo.invalid' }];
  assert.deepEqual(D.codigosEmColisao(pacientes), ['P9001']);
  const plano = D.planejarLimpezaDeTeste({ pacientes, consultas: [{ linha: 2, id_evento: 'abc', codigo_paciente: 'P9001' }], pagamentos: [], pacotes: [{ linha: 2, codigo_paciente: 'P9001' }] });
  assert.deepEqual(plano, { Pacientes: [], Consultas: [], Pagamentos: [], Pacotes: [] });
});

// Gerador contra um Google simulado (planilha completa do simulador; agenda em memória).
function carregarGerador(configuracao) {
  const eventos = new Map();
  const chamadas = [];
  const base = {
    nome_profissional: 'Dra. Teste', crn: 'CRN-0 00000', valor_primeira_consulta_centavos: '15000', valor_retorno_centavos: '10000',
    regra_retorno_dias: '30', chave_pix: 'teste@exemplo.invalid', nome_recebedor_pix: 'DRA TESTE', cidade_recebedor_pix: 'SAO PAULO',
    prefixo_evento_consulta: 'Consulta', email_alertas: 'alerta@exemplo.invalid', id_modelo_recibo: '', id_pasta_recibos: '',
  };
  const configuracoes = Object.entries({ ...base, ...configuracao });
  const amb = criarAmbiente({
    configuracoes,
    google: {
      Calendar: {
        Events: {
          get: (cal, id) => { if (!eventos.has(id)) throw new Error('API call to calendar.events.get failed with error: Not Found'); return eventos.get(id); },
          insert: (corpo, cal) => { chamadas.push(['insert', cal]); eventos.set(corpo.id, { ...corpo }); },
          update: (corpo, cal, id) => { chamadas.push(['update', cal]); eventos.set(id, { ...corpo }); },
          remove: (cal, id) => { eventos.get(id).status = 'cancelled'; },
          list: () => ({ items: [...eventos.values()].filter((e) => e.status !== 'cancelled') }),
        },
      },
    },
  });
  amb.carregar('Esquema.js', 'Formatos.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Execucao.js', 'LeitorAbas.js', 'Agenda.js', 'DadosTeste.js', 'GeradorTeste.js');
  amb.abas.get('Pacientes').linhas.push(['P0001', 'Real', 'X.', '', 'real@exemplo.invalid', 'leve', '', true]);
  const dados = { get Pacientes() { return amb.abas.get('Pacientes').linhas; }, get Consultas() { return amb.abas.get('Consultas').linhas; }, get Pagamentos() { return amb.abas.get('Pagamentos').linhas; } };
  return { api: { criarDadosDeTeste: () => amb.rodar('criarDadosDeTeste()'), apagarDadosDeTeste: () => amb.rodar('apagarDadosDeTeste()') }, eventos, dados, chamadas, amb };
}

const CAL = 'teste123@group.calendar.google.com';

test('gerador: criar duas vezes não duplica; apagar remove só dados de teste', () => {
  const { api, eventos, dados } = carregarGerador({ calendario_id: CAL, prefixo_evento_consulta: 'Consulta' });
  api.criarDadosDeTeste();
  api.criarDadosDeTeste();
  assert.equal(eventos.size, 9);
  assert.equal(dados.Pacientes.length, 1 + 1 + 6); // cabeçalho + P0001 + 6 de teste
  api.apagarDadosDeTeste();
  assert.deepEqual(dados.Pacientes.map((l) => l[0]), ['codigo', 'P0001']);
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

test('R03: apagador preserva P9500 e apaga a consulta fictícia ainda sem paciente identificado', () => {
  const { api, dados, amb } = carregarGerador({ calendario_id: CAL });
  api.criarDadosDeTeste();
  amb.abas.get('Pacientes').linhas.push(['P9500', 'Outra', 'Y.', '', 'outra@exemplo.invalid', 'leve', '', true]);
  const origem = amb.rodar(`marcaDaAgenda(${JSON.stringify(CAL)})`);
  amb.abas.get('Consultas').linhas.push([D.idEventoTeste(8), '2026-10-05', '13:00', 'primeira', '', 'marcada', '', origem]);
  amb.abas.get('Consultas').linhas.push(['naogerado', '2026-10-06', '13:00', 'primeira', 'P9500', 'marcada', '', origem]);
  api.apagarDadosDeTeste();
  assert.ok(dados.Pacientes.some((l) => l[0] === 'P9500'));
  assert.ok(!dados.Consultas.some((l) => l[0] === D.idEventoTeste(8)));
  assert.ok(dados.Consultas.some((l) => l[0] === 'naogerado'));
});

test('R03: criar recusa código de teste que já existe com outros dados', () => {
  const { api, eventos, dados, amb } = carregarGerador({ calendario_id: CAL });
  amb.abas.get('Pacientes').linhas.push(['P9001', 'Outra', 'Y.', '', 'outra.pessoa@exemplo.invalid', 'leve', '', true]);
  assert.throws(() => api.criarDadosDeTeste(), /P9001.*outros dados/);
  assert.equal(eventos.size, 0);
  assert.equal(dados.Pacientes.length, 3);
});

test('R03: agenda secundária só é usada depois de ela confirmar que é de teste; "não" não escreve nada', () => {
  const nega = carregarGerador({ calendario_id: CAL });
  nega.amb.contexto.SpreadsheetApp.getUi = () => ({ ...nega.amb.ui, alert: () => 'NO' });
  assert.throws(() => nega.api.criarDadosDeTeste(), /não foi confirmada/);
  assert.equal(nega.eventos.size, 0);
  assert.equal(nega.dados.Pacientes.length, 2);
  const ok = carregarGerador({ calendario_id: CAL });
  ok.api.criarDadosDeTeste();
  assert.equal(ok.amb.propriedades.get('agenda_de_teste_confirmada'), CAL);
});

test('R03i: origem vazia (linha de versão antiga) não autoriza apagar; a contagem avisa quantas ficaram', () => {
  const consultas = [{ linha: 2, id_evento: D.idEventoTeste(0), origem: '' }, { linha: 3, id_evento: D.idEventoTeste(1), origem: 'ateste' }];
  const pagamentos = [{ linha: 2, id_evento: D.idEventoTeste(0) }, { linha: 3, id_evento: D.idEventoTeste(1) }];
  const plano = D.planejarLimpezaDeTeste({ pacientes: [], consultas, pagamentos, origemTeste: 'ateste' });
  assert.deepEqual(plano, { Pacientes: [], Consultas: [3], Pagamentos: [3], Pacotes: [] });
  assert.equal(D.contarPreservadasSemProva(consultas, 'ateste'), 1);
  assert.deepEqual(D.planejarLimpezaDeTeste({ pacientes: [], consultas, pagamentos, origemTeste: '' }).Consultas, []);
});

test('R03k: só "não encontrado" prova ausência; cota, acesso e rede não', () => {
  assert.equal(D.eventoAusenteConfirmado(new Error('API call to calendar.events.get failed with error: Not Found')), true);
  assert.equal(D.eventoAusenteConfirmado({ code: 404 }), true);
  assert.equal(D.eventoAusenteConfirmado({ details: { code: 404 } }), true);
  for (const m of ['Quota exceeded ficticio', 'API call to calendar.events.get failed with error: Rate Limit Exceeded', 'Forbidden', 'Não achei a quota Not Found aqui', '']) {
    assert.equal(D.eventoAusenteConfirmado(new Error(m)), false, m);
  }
  assert.equal(D.eventoAusenteConfirmado(null), false);
});

test('R03k: erro de leitura na pré-conferência interrompe antes de gravar pacientes ou eventos', () => {
  const { api, eventos, dados, amb } = carregarGerador({ calendario_id: CAL });
  amb.contexto.Calendar.Events.get = () => { throw new Error('Quota exceeded ficticio'); };
  const escritos = [];
  amb.contexto.Calendar.Events.insert = (...a) => escritos.push(a);
  amb.contexto.Calendar.Events.update = (...a) => escritos.push(a);
  assert.throws(() => api.criarDadosDeTeste(), /Não foi possível conferir/);
  assert.equal(escritos.length, 0);
  assert.equal(dados.Pacientes.length, 2);
  assert.equal(eventos.size, 0);
});

test('R03l: pagamento com id repetido em consulta preservada, ou com código divergente, não é apagado', () => {
  const id = D.idEventoTeste(0);
  const dupla = D.planejarLimpezaDeTeste({
    pacientes: [], origemTeste: 'ateste',
    consultas: [{ linha: 2, id_evento: id, origem: 'ateste', codigo_paciente: 'P9001' }, { linha: 3, id_evento: id, origem: '', codigo_paciente: 'P0001' }],
    pagamentos: [{ linha: 2, id_evento: id, codigo_paciente: 'P0001' }],
  });
  assert.deepEqual(dupla, { Pacientes: [], Consultas: [2], Pagamentos: [], Pacotes: [] });
  const outraOrigem = D.planejarLimpezaDeTeste({
    pacientes: [], origemTeste: 'ateste',
    consultas: [{ linha: 2, id_evento: id, origem: 'ateste', codigo_paciente: 'P9001' }, { linha: 3, id_evento: id, origem: 'aoutra', codigo_paciente: 'P9001' }],
    pagamentos: [{ linha: 2, id_evento: id, codigo_paciente: 'P9001' }],
  });
  assert.deepEqual(outraOrigem.Pagamentos, []);
  const divergente = D.planejarLimpezaDeTeste({
    pacientes: [], origemTeste: 'ateste',
    consultas: [{ linha: 2, id_evento: id, origem: 'ateste', codigo_paciente: 'P9001' }],
    pagamentos: [{ linha: 2, id_evento: id, codigo_paciente: 'P0001' }, { linha: 3, id_evento: id, codigo_paciente: 'P9001' }],
  });
  assert.deepEqual(divergente.Pagamentos, [3]);
});
