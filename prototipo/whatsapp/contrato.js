'use strict';
// B1 (D44): contratos comuns do núcleo local. Só lógica pura e helpers; nada de rede, credencial ou dado real.
// Este código é um PROTÓTIPO fora de src/ e fora do pacote de produção.
const crypto = require('node:crypto');

const FUSO = 'America/Sao_Paulo';

// Mensagens neutras: nunca repetem texto recebido, segredo ou dado de outro paciente.
const MENSAGENS_ERRO = {
  CONTEXTO_INVALIDO: 'Não foi possível confirmar quem está fazendo o pedido.',
  CONTEXTO_INCOMPATIVEL: 'O pedido não pertence a este consultório ou a este perfil.',
  PEDIDO_INVALIDO: 'O pedido está incompleto ou fora do formato esperado.',
  VALIDADE_INVALIDA: 'A validade da liberação está ausente, inválida ou já passou.',
  VINCULO_CONFLITANTE: 'Este número ou este paciente já está vinculado a outro cadastro.',
  PACIENTE_NAO_ENCONTRADO: 'Paciente não encontrado neste consultório.',
  LIBERACAO_INATIVA: 'A liberação deste paciente não está ativa.',
  NAO_ENCONTRADA: 'Consulta não encontrada.',
  CHAVE_REUTILIZADA: 'Esta chave de operação já foi usada com outro conteúdo.',
  FALHA_TEMPORARIA: 'Não foi possível concluir agora. Tente novamente em instantes.',
  ERRO_INTERNO: 'Ocorreu um erro inesperado.',
};

class ErroNucleo extends Error {
  constructor(codigo) {
    super(MENSAGENS_ERRO[codigo] || MENSAGENS_ERRO.ERRO_INTERNO);
    this.name = 'ErroNucleo';
    this.codigo = MENSAGENS_ERRO[codigo] ? codigo : 'ERRO_INTERNO';
  }
}

// Falha injetada nos adaptadores simulados (simula resultado externo incerto).
class FalhaExterna extends Error {
  constructor(ponto) { super('Falha simulada.'); this.name = 'FalhaExterna'; this.ponto = ponto; }
}

// Configuração de TESTE: fictícia, não representa regra operacional de nenhuma cliente.
const CONFIG_TESTE = Object.freeze({
  fuso: FUSO,
  duracaoMin: 50,
  intervaloMin: 10,
  // dia da semana (0=domingo) -> janelas 'HH:MM'
  janelas: Object.freeze({
    1: [['09:00', '12:00'], ['14:00', '18:00']],
    2: [['09:00', '12:00'], ['14:00', '18:00']],
    3: [['09:00', '12:00'], ['14:00', '18:00']],
    4: [['09:00', '12:00'], ['14:00', '18:00']],
    5: [['09:00', '12:00']],
  }),
  diasAFrente: 14,
  antecedenciaMin: 120,
  opcoesPorVez: 4,
  validadeMaximaDias: 365,
  // Limite de frequência por paciente (proteção contra repetição/abuso). Valores de teste.
  limiteEventos: Object.freeze({ max: 30, janelaMs: 60000 }),
  // Regras do painel "precisam de atenção" (D39): sinais factuais, limites configuráveis e de TESTE, não da cliente.
  atencao: Object.freeze({ diasSemRetorno: 14, diasSemResposta: 2, diasAvisoValidade: 7 }),
});

const RE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const RE_CODIGO_PACIENTE = /^[A-Za-z0-9-]{2,20}$/;
const RE_CANAL = /^[0-9]{8,15}$/; // identificador do canal; comparação exata, sem ajuste de dígitos

const ehId = (v) => typeof v === 'string' && RE_ID.test(v);
const ehCodigoPaciente = (v) => typeof v === 'string' && RE_CODIGO_PACIENTE.test(v);
const ehCanal = (v) => typeof v === 'string' && RE_CANAL.test(v);

// JSON canônico (chaves ordenadas) para impressão digital de comandos.
function canonico(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
}
const impressao = (v) => crypto.createHash('sha256').update(canonico(v)).digest('hex');

// Texto recebido do paciente -> comando. Só PARAR e MENU são reconhecidos; o resto é descartado sem guardar.
function comandoDeTexto(texto) {
  const t = String(texto === undefined || texto === null ? '' : texto).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  if (t === 'PARAR') return 'parar';
  if (t === 'MENU') return 'menu';
  return 'texto_livre';
}

// ---- Relógio e fuso ----
function criarRelogio(inicioIso) {
  let agora = Date.parse(inicioIso);
  if (Number.isNaN(agora)) throw new Error('Instante inicial inválido.');
  return { agora: () => agora, avancar(ms) { agora += ms; }, definir(iso) { agora = Date.parse(iso); } };
}

function partesLocais(ms) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = Number(x.value);
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute };
}

// Instante (ms UTC) de uma data/hora local de America/Sao_Paulo.
function instanteLocal(ano, mes, dia, hora, minuto) {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let chute = alvo + 3 * 3600000;
  for (let i = 0; i < 3; i += 1) {
    const p = partesLocais(chute);
    const dif = alvo - Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
    if (dif === 0) break;
    chute += dif;
  }
  return chute;
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dois = (n) => String(n).padStart(2, '0');
// "qui 01/10 às 09:00" no fuso da clínica.
function formatarInstante(ms) {
  const p = partesLocais(ms);
  const dia = DIAS[new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay()];
  return `${dia} ${dois(p.dia)}/${dois(p.mes)} às ${dois(p.hora)}:${dois(p.minuto)}`;
}

// ISO com fuso explícito ("Z" ou ±hh:mm) -> ms; qualquer outra coisa é inválida.
function lerInstanteIso(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

// ---- Horários possíveis a partir da configuração (pura) ----
// Devolve [{ inicio, fim }] (ms) em ordem, só no futuro (depois da antecedência mínima).
function gerarHorarios(agoraMs, config = CONFIG_TESTE) {
  const saida = [];
  const hoje = partesLocais(agoraMs);
  const passo = (config.duracaoMin + config.intervaloMin) * 60000;
  for (let d = 0; d <= config.diasAFrente; d += 1) {
    const base = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + d));
    const [ano, mes, dia] = [base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()];
    for (const [ini, fim] of config.janelas[base.getUTCDay()] || []) {
      const [hi, mi] = ini.split(':').map(Number);
      const [hf, mf] = fim.split(':').map(Number);
      const limite = instanteLocal(ano, mes, dia, hf, mf);
      for (let t = instanteLocal(ano, mes, dia, hi, mi); t + config.duracaoMin * 60000 <= limite; t += passo) {
        if (t >= agoraMs + config.antecedenciaMin * 60000) saida.push({ inicio: t, fim: t + config.duracaoMin * 60000 });
      }
    }
  }
  return saida;
}

module.exports = {
  FUSO, MENSAGENS_ERRO, ErroNucleo, FalhaExterna, CONFIG_TESTE,
  ehId, ehCodigoPaciente, ehCanal, canonico, impressao, comandoDeTexto,
  criarRelogio, partesLocais, instanteLocal, formatarInstante, lerInstanteIso, gerarHorarios,
};
