// Cenários sintéticos em escala (Gate, item 36): só dados inventados, gerados por uma sequência fixa (sem Math.random).
// Monta um consultório simulado com N pacientes, C consultas e P pagamentos e conta as chamadas externas (planilha, Agenda, Drive).
const { criarConsultorio, CONFIG_COMPLETA } = require('./fluxo.js');
const { eventoDaAgenda } = require('./fluxo.js');
const { linhaPagamento } = require('../../src/Pagamentos.js');

// Sequência congruencial: a mesma em qualquer máquina.
function criarSorteio(semente = 20261001) {
  let estado = semente;
  return (n) => { estado = (estado * 1664525 + 1013904223) % 4294967296; return Math.floor((estado / 4294967296) * n); }; // bits de cima: os de baixo desse tipo de gerador se repetem em ciclos curtos
}

const cod = (i) => `P${String(i + 1).padStart(4, '0')}`;
const doisDigitos = (n) => String(n).padStart(2, '0');

// Dia i dentro da janela de sincronização (hoje = 2026-09-30; olha 30 dias para trás e 120 para frente), horário de hora em hora.
function dataEHora(i) {
  const dia = (i % 140) - 30; // -30 .. +109 dias a partir de hoje
  const base = new Date(Date.UTC(2026, 8, 30 + dia));
  const hora = 8 + (i % 10);
  return { data: `${base.getUTCFullYear()}-${doisDigitos(base.getUTCMonth() + 1)}-${doisDigitos(base.getUTCDate())}`, hora: `${doisDigitos(hora)}:00` };
}

// Conta as chamadas externas que o código faz. A planilha vale por CHAMADA (uma leitura de 5.000 linhas é uma chamada).
function instrumentar(c) {
  const n = { leituras: 0, escritas: 0, ultimaLinha: 0, agendaLista: 0, agendaGet: 0, drive: 0, abrirFolha: 0 };
  for (const aba of c.amb.abas.values()) {
    const getRange = aba.getRange.bind(aba);
    aba.getRange = (...a) => {
      const r = getRange(...a);
      const gv = r.getValues; const sv = r.setValues;
      r.getValues = () => { n.leituras++; return gv(); };
      r.setValues = (v) => { n.escritas++; return sv(v); };
      return r;
    };
    const ur = aba.getLastRow.bind(aba);
    aba.getLastRow = () => { n.ultimaLinha++; return ur(); };
    const ap = aba.appendRow.bind(aba);
    aba.appendRow = (l) => { n.escritas++; return ap(l); };
  }
  // A agenda do Google devolve até `maxResults` itens por página: o simulador padrão devolve tudo de uma vez, então aqui se pagina de verdade.
  const eventos = c.amb.contexto.Calendar.Events;
  const todos = () => c.eventosEscala || [];
  eventos.list = (cal, o = {}) => {
    n.agendaLista++;
    const de = o.pageToken ? Number(o.pageToken) : 0;
    const tam = o.maxResults || 250;
    const itens = todos().slice(de, de + tam);
    return { items: itens, nextPageToken: de + tam < todos().length ? String(de + tam) : undefined };
  };
  const get = eventos.get;
  eventos.get = (...a) => { n.agendaGet++; return get(...a); };
  c.contador = n;
  c.drive.chamadas.length = 0;
  c.chamadasDrive = () => c.drive.chamadas.length;
  c.zerar = () => { for (const k of Object.keys(n)) n[k] = 0; c.drive.chamadas.length = 0; };
  return n;
}

// pacientes: quantos; consultas: quantas (já sincronizadas na planilha e presentes na agenda); pagamentos: quantos (já gravados).
function criarCenario({ pacientes = 100, consultas = 1000, pagamentos = 0, semMarca = false, eventosNovos = 0 } = {}) {
  const c = criarConsultorio();
  const sorteio = criarSorteio();
  const abaPac = c.amb.abas.get('Pacientes');
  const cabPac = abaPac.linhas[0];
  abaPac.linhas.length = 1;
  for (let i = 0; i < pacientes; i++) {
    const linha = new Array(cabPac.length).fill('');
    const v = { codigo: cod(i), primeiro_nome: `Paciente${i}`, inicial_sobrenome: 'T.', telefone: `5511${String(900000000 + i)}`, email: `p${i}@exemplo.invalid`, modo_acompanhamento: 'leve', ativo: true };
    for (const [k, x] of Object.entries(v)) if (cabPac.indexOf(k) >= 0) linha[cabPac.indexOf(k)] = x;
    abaPac.linhas.push(linha);
  }
  const abaCon = c.amb.abas.get('Consultas');
  const cabCon = abaCon.linhas[0];
  abaCon.linhas.length = 1;
  abaCon.maxLinhas = Math.max(1000, consultas + eventosNovos + 10);
  const eventos = [];
  const origem = c.rodar("marcaDaAgenda('primary')");
  for (let i = 0; i < consultas; i++) {
    const { data, hora } = dataEHora(i);
    const id = `ev${String(i).padStart(6, '0')}`;
    const codigo = cod(sorteio(pacientes));
    const linha = [id, data, hora, i % 5 === 0 ? 'primeira' : 'retorno', codigo, 'marcada', '2026-09-30 12:00:00', semMarca ? '' : origem];
    abaCon.linhas.push(linha);
    eventos.push({ id, status: 'confirmed', summary: 'Consulta', start: { dateTime: `${data}T${hora}:00-03:00` }, end: { dateTime: `${data}T${hora}:50-03:00` }, attendees: [{ email: `p${Number(codigo.slice(1)) - 1}@exemplo.invalid` }] });
  }
  for (let i = 0; i < eventosNovos; i++) {
    const { data, hora } = dataEHora(consultas + i);
    eventos.push({ id: `nv${String(i).padStart(6, '0')}`, status: 'confirmed', summary: 'Consulta', start: { dateTime: `${data}T${hora}:00-03:00` }, end: { dateTime: `${data}T${hora}:50-03:00` }, attendees: [{ email: `p${sorteio(pacientes)}@exemplo.invalid` }] });
  }
  const abaPag = c.amb.abas.get('Pagamentos');
  abaPag.linhas.length = 1;
  abaPag.maxLinhas = Math.max(1000, pagamentos + consultas + 10);
  for (let i = 0; i < pagamentos; i++) {
    const idEvento = `ev${String(i % Math.max(consultas, 1)).padStart(6, '0')}`;
    const pago = i % 3 !== 0;
    abaPag.linhas.push(linhaPagamento({
      id: `PG${String(i + 1).padStart(6, '0')}`, id_evento: idEvento, codigo_paciente: cod(i % pacientes), pagador_nome: '', pagador_cpf: '',
      valor_centavos: 15000, forma: pago ? 'pix' : '', status: pago ? 'pago' : 'a_receber', data_pagamento: pago ? `2026-09-${doisDigitos(1 + (i % 28))}` : '', link_recibo: '', pacote_inicio: '',
    }));
  }
  c.eventosEscala = eventos;
  instrumentar(c);
  return c;
}

module.exports = { criarCenario, criarSorteio, instrumentar, cod, dataEHora };
