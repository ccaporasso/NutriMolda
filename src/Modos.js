// T24 (ESQUELETO): os três modos de acompanhamento e o limite de mensagens por modo.
// O modo é escolhido pelo paciente (D9). Não responder NUNCA gera cobrança nem penalidade: este módulo não
// conhece valores nem pagamentos. Só lógica pura. Pendências: PENDENTE Pn (docs/PENDENCIAS-FASE-2B.md).

const MODOS_ACOMPANHAMENTO = ['porta_aberta', 'leve', 'proximo'];

// PENDENTE P9: quantas mensagens por semana cada modo permite e o que cada modo significa na prática.
// Valores só de esqueleto. porta_aberta = 0: a nutricionista não puxa conversa; o paciente escreve quando quiser.
const LIMITE_SEMANAL_POR_MODO = { porta_aberta: 0, leve: 1, proximo: 2 };

// PENDENTE P10: de onde vem a contagem de mensagens já mandadas na semana (aba de controle ainda não existe).
// Por isso `enviadasNaSemana` entra como parâmetro.

// paciente: { modo_acompanhamento, autorizou_mensagens_em, ativo }. Devolve { pode, motivo, restantes }.
function podeMandarMensagem({ paciente, enviadasNaSemana }) {
  const recusa = (motivo) => ({ pode: false, motivo, restantes: 0 });
  if (!paciente || paciente.ativo === false) return recusa('O paciente está inativo.');
  if (!paciente.autorizou_mensagens_em) return recusa('O paciente ainda não autorizou receber mensagens.');
  if (!MODOS_ACOMPANHAMENTO.includes(paciente.modo_acompanhamento)) return recusa('O paciente não escolheu um modo de acompanhamento.');
  if (!Number.isSafeInteger(enviadasNaSemana) || enviadasNaSemana < 0) return recusa('Contagem de mensagens da semana inválida.');
  const limite = LIMITE_SEMANAL_POR_MODO[paciente.modo_acompanhamento];
  if (limite === 0) return recusa('No modo "porta aberta" a nutricionista não puxa conversa: o paciente escreve quando quiser.');
  if (enviadasNaSemana >= limite) return recusa(`O limite de ${limite} mensagem(ns) por semana do modo "${paciente.modo_acompanhamento}" já foi usado.`);
  return { pode: true, motivo: '', restantes: limite - enviadasNaSemana };
}

// Início da semana (segunda-feira) da data "AAAA-MM-DD", para contar as mensagens da semana.
function inicioDaSemana(dataTexto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataTexto));
  if (!m) throw new Error('Data inválida.');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== dataTexto) throw new Error('Data inválida.');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

if (typeof module !== 'undefined') {
  module.exports = { MODOS_ACOMPANHAMENTO, LIMITE_SEMANAL_POR_MODO, podeMandarMensagem, inicioDaSemana };
}
