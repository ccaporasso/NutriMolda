'use strict';
// Monta um consultório FICTÍCIO completo (repositórios simulados, relógio, núcleo e pacientes inventados).
// Usado pelos testes, pelo simulador e pela interface local: todos passam pelo mesmo núcleo.
const C = require('./contrato.js');
const { criarAdaptadorConfiavel, criarRepositorios } = require('./adaptadores.js');
const { criarNucleo } = require('./nucleo.js');
const { montarAgendamento } = require('./agendamento.js');

const CONS = 'CONS-A';
const OUTRO_CONS = 'CONS-B';
const PROFISSIONAL = 'PROF-1';
// Identificadores de canal inventados (não são telefones reais).
const CANAIS = { F001: '5511000000001', F002: '5511000000002', F003: '5511000000003' };
const PACIENTES = [
  { codigo: 'F001', nome: 'Paciente Fictícia Um' },
  { codigo: 'F002', nome: 'Paciente Fictício Dois' },
  { codigo: 'F003', nome: 'Paciente Fictícia Três' },
];

async function criarCenario({ inicio = '2026-10-01T12:00:00Z', latencia = false, extras = montarAgendamento } = {}) {
  const relogio = C.criarRelogio(inicio);
  const confiavel = criarAdaptadorConfiavel();
  const repos = criarRepositorios({ latencia });
  const logs = [];
  let manipuladores = {};
  if (extras) { const r = extras({ repos, relogio, config: C.CONFIG_TESTE }); manipuladores = r.manipuladores || {}; Object.assign(repos, r.repos || {}); }
  const montar = () => criarNucleo({ verificar: confiavel.verificar, repos, relogio, registrar: (l) => logs.push(l), manipuladores });
  const nucleo = montar();
  const prof = confiavel.contextoProfissional(CONS, PROFISSIONAL);
  const sistema = confiavel.contextoSistema(CONS);
  for (const p of PACIENTES) await nucleo.cadastrarPaciente(prof, { consultorioId: CONS, codigoPaciente: p.codigo, nome: p.nome });
  const ctxPac = (codigo) => confiavel.contextoPaciente(CONS, CANAIS[codigo]);
  const horas = (h) => new Date(relogio.agora() + h * 3600000).toISOString();
  let seq = 0;
  const liberar = (codigo, validaAte = horas(24 * 30)) => nucleo.liberarPaciente(prof, { consultorioId: CONS, codigoPaciente: codigo, canalId: CANAIS[codigo], validaAte });
  const enviar = (codigo, comando, parametros, eventoId) => nucleo.processarEventoPaciente(ctxPac(codigo), { consultorioId: CONS, eventoId: eventoId || `E${++seq}`, comando, parametros });
  // Recria o processador mantendo os repositórios simulados (testa retomada; não prova persistência real).
  const recriarNucleo = montar;
  return { relogio, confiavel, repos, nucleo, recriarNucleo, logs, prof, sistema, ctxPac, liberar, enviar, horas, CONS, OUTRO_CONS };
}

module.exports = { criarCenario, CONS, OUTRO_CONS, PROFISSIONAL, CANAIS, PACIENTES };
