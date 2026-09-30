// T05: lógica pura da sincronização e a camada do Google contra um Google simulado. Só dados inventados.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/Agenda.js');
const D = require('../src/DadosTeste.js');
const { criarAmbiente } = require('./apoio/simulacao.js');

const hoje = { ano: 2026, mes: 9, dia: 30 };
const janela = A.calcularJanelaAgenda(hoje);
const pacientes = D.PACIENTES_TESTE.map((p) => ({ codigo: p.codigo, email: p.email, telefone: p.telefone, ativo: true }));

const evento = (id, titulo, data, hora, extra = {}) => ({
  id, status: 'confirmed', summary: titulo, description: '',
  start: { dateTime: `${data}T${hora}:00-03:00` }, end: { dateTime: `${data}T${hora}:50:00-03:00` }, ...extra,
});
const plano = (eventos, existentes = []) => A.planejarSincronizacaoAgenda({
  eventos, existentes, pacientes, prefixo: 'Consulta', janela, agoraTexto: '2026-09-30 12:00:00',
});

test('janela: 30 dias para trás, leitura até 120 e cancelamento por ausência até 90 dias', () => {
  assert.equal(janela.verificarDe, '2026-08-31');
  assert.equal(janela.verificarAte, '2026-12-29');
  assert.equal(janela.timeMin, '2026-08-31T00:00:00-03:00');
  assert.equal(janela.timeMax, '2027-01-28T00:00:00-03:00');
});

test('paciente identificado pelo e-mail do convidado, pela descrição ou pelo telefone', () => {
  const porConvidado = evento('a1', 'Consulta — Ana S.', '2026-10-01', '09:00', { attendees: [{ email: 'ANA.teste@exemplo.invalid' }] });
  assert.equal(A.identificarPacienteAgenda(porConvidado, pacientes), 'P9001');
  const porDescricao = evento('a2', 'Consulta', '2026-10-01', '09:00', { description: 'DADO DE TESTE. Contato: bruno.teste@exemplo.invalid' });
  assert.equal(A.identificarPacienteAgenda(porDescricao, pacientes), 'P9002');
  const porTelefone = evento('a3', 'Consulta', '2026-10-01', '09:00', { description: 'Fone: +55 (11) 90000-0003' });
  assert.equal(A.identificarPacienteAgenda(porTelefone, pacientes), 'P9003');
  const desconhecido = evento('a4', 'Consulta', '2026-10-01', '09:00', { description: 'x@exemplo.invalid' });
  assert.equal(A.identificarPacienteAgenda(desconhecido, pacientes), null);
});

test('contato que bate com dois pacientes ou com paciente inativo não é adivinhado', () => {
  const dois = evento('b1', 'Consulta', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid bruno.teste@exemplo.invalid' });
  assert.equal(A.identificarPacienteAgenda(dois, pacientes), null);
  const inativos = pacientes.map((p) => ({ ...p, ativo: p.codigo === 'P9001' ? false : p.ativo }));
  assert.equal(A.identificarPacienteAgenda(evento('b2', 'Consulta', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid' }), inativos), null);
});

test('evento novo vira linha de Consultas; o que não é consulta ou é dia inteiro é ignorado', () => {
  const p = plano([
    evento('e1', 'Consulta — Ana S.', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid' }),
    evento('e2', 'Almoço', '2026-10-01', '12:00'),
    { id: 'e3', status: 'confirmed', summary: 'Consulta feriado', start: { date: '2026-10-12' } },
  ]);
  assert.deepEqual(p.inserir, [['e1', '2026-10-01', '09:00', 'primeira', 'P9001', 'marcada', '2026-09-30 12:00:00']]);
  assert.equal(p.ignorados, 2);
  assert.equal(p.aIdentificar.length, 0);
});

test('não grava título nem descrição do evento em nenhuma linha', () => {
  const p = plano([evento('e1', 'Consulta — Ana S. dieta', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid diabetes' })]);
  assert.doesNotMatch(JSON.stringify(p), /Ana|dieta|diabetes|exemplo/);
});

test('primeira x retorno: o segundo evento do mesmo paciente é retorno, mesmo vindo antes na lista', () => {
  const p = plano([
    evento('r2', 'Consulta', '2026-10-20', '09:00', { description: 'ana.teste@exemplo.invalid' }),
    evento('r1', 'Consulta', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid' }),
  ]);
  assert.deepEqual(p.inserir.map((l) => [l[0], l[3]]), [['r1', 'primeira'], ['r2', 'retorno']]);
});

test('consulta anterior já na planilha faz o novo evento ser retorno', () => {
  const existentes = [{ linha: 2, id_evento: 'antigo', data: '2026-09-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'realizada', atualizado_em: '' }];
  const p = plano([evento('n1', 'Consulta', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid' })], existentes);
  assert.equal(p.inserir[0][3], 'retorno');
});

test('sem paciente conhecido vai para a lista "a identificar"', () => {
  const p = plano([evento('d1', 'Consulta — Fulano D.', '2026-10-05', '13:00', { description: 'desconhecido.teste@exemplo.invalid' })]);
  assert.deepEqual(p.aIdentificar, [{ id_evento: 'd1', data: '2026-10-05', hora: '13:00' }]);
  assert.equal(p.inserir[0][4], '');
  assert.match(A.resumirSincronizacao(p), /A identificar: 1/);
});

test('segunda execução com os mesmos eventos não muda nada (idempotente)', () => {
  const eventos = [evento('e1', 'Consulta', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid' })];
  const primeira = plano(eventos);
  const existentes = primeira.inserir.map((l, i) => ({ linha: i + 2, id_evento: l[0], data: l[1], hora: l[2], tipo: l[3], codigo_paciente: l[4], status: l[5], atualizado_em: l[6] }));
  const segunda = plano(eventos, existentes);
  assert.equal(segunda.inserir.length, 0);
  assert.equal(segunda.atualizar.length, 0);
});

test('remarcação muda data e hora; status e tipo ajustados por ela são preservados', () => {
  const existentes = [{ linha: 5, id_evento: 'e1', data: '2026-10-01', hora: '09:00', tipo: 'retorno', codigo_paciente: 'P9001', status: 'realizada', atualizado_em: '' }];
  const p = plano([evento('e1', 'Consulta', '2026-10-02', '10:30', { description: 'ana.teste@exemplo.invalid' })], existentes);
  assert.deepEqual(p.atualizar, [{ linha: 5, valores: ['e1', '2026-10-02', '10:30', 'retorno', 'P9001', 'realizada', '2026-09-30 12:00:00'] }]);
});

test('código preenchido à mão por ela nunca é trocado', () => {
  const existentes = [{ linha: 2, id_evento: 'e1', data: '2026-10-01', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9005', status: 'marcada', atualizado_em: '' }];
  const p = plano([evento('e1', 'Consulta', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid' })], existentes);
  assert.equal(p.atualizar.length, 0);
});

test('cancelamento: evento cancelado na agenda vira cancelada; realizada não é desfeita', () => {
  const existentes = [
    { linha: 2, id_evento: 'c1', data: '2026-10-01', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada', atualizado_em: '' },
    { linha: 3, id_evento: 'c2', data: '2026-09-20', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9002', status: 'realizada', atualizado_em: '' },
  ];
  const p = plano([{ id: 'c1', status: 'cancelled' }, { id: 'c2', status: 'cancelled' }], existentes);
  assert.equal(p.canceladas, 1);
  assert.deepEqual(p.atualizar.map((a) => [a.linha, a.valores[5]]), [[2, 'cancelada']]);
});

test('ausência na leitura não cancela: o plano só lista as consultas marcadas a conferir', () => {
  const existentes = [
    { linha: 2, id_evento: 's1', data: '2026-10-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada', atualizado_em: '' },
    { linha: 3, id_evento: 's2', data: '2027-03-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9002', status: 'marcada', atualizado_em: '' },
    { linha: 4, id_evento: 's3', data: '2026-10-12', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9003', status: 'marcada', atualizado_em: '' },
  ];
  const p = plano([evento('s3', 'Consulta', '2026-10-12', '09:00')], existentes);
  assert.deepEqual(p.ausentes, ['s1']); // s2 está fora do período; s3 continua na agenda
  assert.equal(p.canceladas, 0);
  assert.deepEqual(p.atualizar, []);
});

test('R04: consulta remarcada para depois da janela não é cancelada por sumir da leitura', () => {
  const existentes = [{ linha: 2, id_evento: 'r1', data: '2026-10-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada', atualizado_em: '' }];
  const p = plano([evento('outro', 'Compromisso', '2026-10-02', '09:00')], existentes);
  assert.equal(p.canceladas, 0);
  // A conferência individual devolve o evento remarcado para 01/02/2027: a linha só muda de data.
  const conferido = plano([evento('outro', 'Compromisso', '2026-10-02', '09:00'), evento('r1', 'Consulta', '2027-02-01', '09:00')], existentes);
  assert.equal(conferido.canceladas, 0);
  assert.deepEqual(conferido.atualizar.map((a) => [a.valores[1], a.valores[5]]), [['2027-02-01', 'marcada']]);
});

test('calendario_id trocado: nada é conferido nem cancelado por ausência', () => {
  const existentes = [{ linha: 2, id_evento: 'a1', data: '2026-10-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada', atualizado_em: '' }];
  const p = A.planejarSincronizacaoAgenda({
    eventos: [evento('n1', 'Consulta', '2026-10-12', '09:00')], existentes, pacientes: D.PACIENTES_TESTE.map((x) => ({ ...x })),
    prefixo: 'Consulta', janela, agoraTexto: '2026-09-30 12:00:00', agendaMudou: true,
  });
  assert.deepEqual(p.ausentes, []);
  assert.equal(p.canceladas, 0);
  assert.match(p.avisos[0], /calendario_id/);
});

test('agenda que volta vazia não cancela nada e avisa', () => {
  const existentes = [{ linha: 2, id_evento: 's1', data: '2026-10-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada', atualizado_em: '' }];
  const p = plano([], existentes);
  assert.equal(p.canceladas, 0);
  assert.equal(p.avisos.length, 1);
  assert.match(p.avisos[0], /calendario_id/);
});

test('evento cancelado que voltou para a agenda reativa a consulta', () => {
  const existentes = [{ linha: 2, id_evento: 'v1', data: '2026-10-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'cancelada', atualizado_em: '' }];
  const p = plano([evento('v1', 'Consulta', '2026-10-10', '09:00')], existentes);
  assert.equal(p.atualizar[0].valores[5], 'marcada');
});

test('R05: consulta cancelada nesta execução não faz a nova virar retorno', () => {
  const antiga = { linha: 2, id_evento: 'antigo', data: '2026-10-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada', atualizado_em: '' };
  const novo = evento('novo', 'Consulta', '2026-10-20', '09:00', { description: 'ana.teste@exemplo.invalid' });
  const p = plano([{ id: 'antigo', status: 'cancelled' }, novo], [antiga]);
  assert.equal(p.inserir[0][3], 'primeira');
});

test('R05: consulta remarcada para depois da nova não conta como anterior', () => {
  const antiga = { linha: 2, id_evento: 'antigo', data: '2026-10-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'marcada', atualizado_em: '' };
  const email = { description: 'ana.teste@exemplo.invalid' };
  const p = plano([evento('antigo', 'Consulta', '2026-11-10', '09:00', email), evento('novo', 'Consulta', '2026-10-20', '09:00', email)], [antiga]);
  assert.equal(p.inserir[0][3], 'primeira');
  assert.deepEqual(p.atualizar.map((a) => a.valores[1]), ['2026-11-10']);
});

test('R05: consulta anterior válida continua fazendo a nova ser retorno; reativação conta', () => {
  const email = { description: 'ana.teste@exemplo.invalid' };
  const antiga = { linha: 2, id_evento: 'antigo', data: '2026-10-10', hora: '09:00', tipo: 'primeira', codigo_paciente: 'P9001', status: 'cancelada', atualizado_em: '' };
  const p = plano([evento('antigo', 'Consulta', '2026-10-10', '09:00', email), evento('novo', 'Consulta', '2026-10-20', '09:00', email)], [antiga]);
  assert.equal(p.atualizar[0].valores[5], 'marcada');
  assert.equal(p.inserir[0][3], 'retorno');
});

// ---------- camada do Google (Google simulado) ----------

const CONFIG = [
  ['nome_profissional', 'Dra. Teste'], ['crn', 'CRN-0 00000'], ['valor_primeira_consulta_centavos', '15000'],
  ['valor_retorno_centavos', '10000'], ['regra_retorno_dias', '30'], ['chave_pix', 'teste@exemplo.invalid'],
  ['nome_recebedor_pix', 'DRA TESTE'], ['cidade_recebedor_pix', 'SAO PAULO'], ['calendario_id', 'primary'],
  ['prefixo_evento_consulta', 'Consulta'], ['email_alertas', 'alerta@exemplo.invalid'], ['id_modelo_recibo', ''], ['id_pasta_recibos', ''],
];

function ambienteSync(eventos) {
  const amb = criarAmbiente({ configuracoes: CONFIG, eventos });
  for (const p of D.PACIENTES_TESTE) amb.abas.get('Pacientes').linhas.push(D.linhaPaciente(p));
  amb.carregar('Esquema.js', 'Formatos.js', 'Configuracoes.js', 'LeitorConfiguracoes.js', 'Registro.js', 'Alertas.js', 'Execucao.js', 'LeitorAbas.js', 'Agenda.js', 'SincronizarAgenda.js');
  return amb;
}

test('Google simulado: duas execuções seguidas não duplicam; cancelamento é tratado', () => {
  const eventos = [
    evento('g1', 'Consulta — Ana S.', '2026-10-01', '09:00', { description: 'ana.teste@exemplo.invalid' }),
    evento('g2', 'Consulta — Fulano D.', '2026-10-05', '13:00', { description: 'desconhecido.teste@exemplo.invalid' }),
  ];
  const amb = ambienteSync(eventos);
  amb.rodar('sincronizarAgenda()');
  const consultas = amb.abas.get('Consultas').linhas;
  assert.equal(consultas.length, 3); // cabeçalho + 2
  amb.rodar('sincronizarAgenda()');
  assert.equal(amb.abas.get('Consultas').linhas.length, 3);

  eventos[0] = { id: 'g1', status: 'cancelled' };
  amb.rodar('sincronizarAgenda()');
  assert.equal(amb.abas.get('Consultas').linhas[1][5], 'cancelada');
  assert.equal(amb.abas.get('Consultas').linhas.length, 3);
  const registro = amb.abas.get('Registro').linhas.slice(1).map((l) => l[3]).join('\n');
  assert.doesNotMatch(registro, /Ana|exemplo/);
});

test('Google simulado: o gatilho automático é criado uma vez só', () => {
  const amb = ambienteSync([]);
  amb.rodar('ativarSincronizacaoAutomatica()');
  amb.rodar('ativarSincronizacaoAutomatica()');
  assert.equal(amb.contexto.ScriptApp.triggers.length, 1);
  assert.equal(amb.contexto.ScriptApp.triggers[0].f, 'sincronizarAgendaAutomatica');
});

test('Google simulado: falha no gatilho vai para o Registro e para o e-mail, sem texto da exceção', () => {
  const amb = ambienteSync([]);
  amb.contexto.Calendar = { Events: { list: () => { throw new Error('Ana S. tem diabetes'); } } };
  amb.rodar('sincronizarAgendaAutomatica()');
  const registro = amb.abas.get('Registro').linhas.slice(1).map((l) => l.join(' ')).join('\n');
  assert.match(registro, /Falha no módulo sincronizacao/);
  assert.doesNotMatch(registro + JSON.stringify(amb.emails), /diabetes|Ana/);
  assert.equal(amb.emails.length, 1);
});
