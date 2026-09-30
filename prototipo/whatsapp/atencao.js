'use strict';
// Item 3 (WA07/D39): painel "Pacientes que precisam de atenção". Só sinais FACTUAIS com data (o que aconteceu e
// desde quando). Sem probabilidade, sem classificação clínica, sem previsão de abandono. Só código e nome do
// cadastro; nenhuma mensagem de conversa entra aqui. Regras configuráveis (limites de teste, não da cliente).
const { formatarInstante, CONFIG_TESTE } = require('./contrato.js');

const DIA = 86400000;

// pacientes: [{ codigo, nome, liberacao: 'ativa'|'expirada'|..., concedidaEm, validaAte, conversa: {estado, atualizadoEm, pausadoPor}|null, consultas: [{inicio,fim,status}] }]
function calcularAtencao({ pacientes, agora, regras = CONFIG_TESTE.atencao }) {
  const saida = [];
  for (const p of pacientes) {
    const sinais = [];
    const conv = p.conversa;
    if (p.liberacao === 'expirada') {
      sinais.push({ tipo: 'liberacao_expirada', desde: p.validaAte, texto: `Liberação expirou em ${formatarInstante(p.validaAte)}` });
    }
    if (p.liberacao === 'ativa') {
      if (conv && conv.estado === 'atendimento_humano') {
        const quem = conv.pausadoPor === 'paciente' ? 'Pediu atendimento humano' : 'Automação pausada pela profissional';
        sinais.push({ tipo: 'atendimento_humano', desde: conv.atualizadoEm, texto: `${quem} em ${formatarInstante(conv.atualizadoEm)}` });
      }
      if (conv && (conv.estado === 'escolhendo_horario' || conv.estado === 'aguardando_confirmacao') && agora - conv.atualizadoEm >= regras.diasSemResposta * DIA) {
        sinais.push({ tipo: 'sem_resposta', desde: conv.atualizadoEm, texto: `Sem resposta desde ${formatarInstante(conv.atualizadoEm)} (horário ainda não confirmado)` });
      }
      const ativas = (p.consultas || []).filter((c) => c.status === 'confirmada');
      const futura = ativas.some((c) => c.fim > agora);
      if (!futura) {
        const ultimaFim = ativas.reduce((m, c) => Math.max(m, c.fim), 0);
        const referencia = Math.max(ultimaFim, p.concedidaEm || 0);
        if (referencia && agora - referencia >= regras.diasSemRetorno * DIA) {
          sinais.push({ tipo: 'sem_retorno_marcado', desde: referencia, texto: ultimaFim ? `Sem consulta marcada desde a última, em ${formatarInstante(ultimaFim)}` : `Sem consulta marcada desde a liberação, em ${formatarInstante(p.concedidaEm)}` });
        }
      }
      if (p.validaAte - agora <= regras.diasAvisoValidade * DIA) {
        sinais.push({ tipo: 'liberacao_a_vencer', desde: p.validaAte, texto: `Liberação vence em ${formatarInstante(p.validaAte)}` });
      }
    }
    if (sinais.length) saida.push({ codigo: p.codigo, nome: p.nome, sinais });
  }
  // Mais sinais primeiro; empate pelo sinal mais antigo.
  const maisAntigo = (x) => Math.min(...x.sinais.map((s) => s.desde));
  return saida.sort((a, b) => b.sinais.length - a.sinais.length || maisAntigo(a) - maisAntigo(b) || a.codigo.localeCompare(b.codigo));
}

module.exports = { calcularAtencao };
