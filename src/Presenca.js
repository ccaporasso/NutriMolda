// T21 (ESQUELETO): painel de presença. Aponta quem merece um olhar dela, sem mandar nada a ninguém.
// Sinais: "ainda não" duas vezes seguidas, silêncio, nota escrita e retorno sem data.
// Só lógica pura; só códigos de paciente (nunca nome). Pendências marcadas PENDENTE Pn (docs/PENDENCIAS-FASE-2B.md).

// PENDENTE P3: os limites são dela. Estes valores são só um esqueleto para os testes.
const PARAMETROS_PRESENCA = { diasSilencio: 14, aindaNaoSeguidos: 2, diasRetornoSemData: 7 };

function formatosPresenca_() {
  return typeof textoParaData !== 'undefined' ? { textoParaData } : require('./Formatos.js');
}

// Dias entre duas datas "AAAA-MM-DD" (b - a). Devolve null se alguma não for data real.
function diasEntrePresenca_(a, b) {
  const f = formatosPresenca_();
  const da = f.textoParaData(a);
  const db = f.textoParaData(b);
  if (!da || !db) return null;
  return Math.round((Date.UTC(db.ano, db.mes - 1, db.dia) - Date.UTC(da.ano, da.mes - 1, da.dia)) / 86400000);
}

const dataDe_ = (dataHora) => String(dataHora).slice(0, 10);

// pacientes: { codigo, autorizou_mensagens_em, ativo }. respostas: { data_hora, codigo_paciente, resposta, nota }.
// consultas: { data, codigo_paciente, status }. hojeTexto: "AAAA-MM-DD".
// Devolve [{ codigo, sinais: [...] }] só de quem tem algum sinal, do mais para o menos sinais.
function calcularPresenca({ pacientes, respostas, consultas, hojeTexto, parametros = PARAMETROS_PRESENCA }) {
  const saida = [];
  for (const p of pacientes) {
    if (p.ativo === false) continue;
    const codigo = String(p.codigo);
    const dele = respostas.filter((r) => String(r.codigo_paciente) === codigo)
      .sort((a, b) => String(a.data_hora).localeCompare(String(b.data_hora)));
    const sinais = [];

    const ultimas = dele.slice(-parametros.aindaNaoSeguidos);
    if (ultimas.length === parametros.aindaNaoSeguidos && ultimas.every((r) => r.resposta === 'ainda_nao')) sinais.push('ainda_nao_seguido');

    // Silêncio conta a partir da última resposta ou, se nunca respondeu, da data em que autorizou as mensagens.
    const referencia = dele.length > 0 ? dataDe_(dele[dele.length - 1].data_hora) : (p.autorizou_mensagens_em ? dataDe_(p.autorizou_mensagens_em) : null);
    const parado = referencia ? diasEntrePresenca_(referencia, hojeTexto) : null;
    if (parado !== null && parado >= parametros.diasSilencio) sinais.push('silencio');

    // PENDENTE P4: "nota lida" ainda não existe; por ora a nota mais recente com texto sempre aparece.
    if (dele.length > 0 && String(dele[dele.length - 1].nota || '').trim() !== '') sinais.push('nota_escrita');

    const dasConsultas = consultas.filter((c) => String(c.codigo_paciente) === codigo && c.status !== 'cancelada');
    const realizadas = dasConsultas.filter((c) => c.status === 'realizada').map((c) => String(c.data)).sort();
    const temFutura = dasConsultas.some((c) => c.status === 'marcada' && String(c.data) >= hojeTexto);
    if (realizadas.length > 0 && !temFutura) {
      const desde = diasEntrePresenca_(realizadas[realizadas.length - 1], hojeTexto);
      if (desde !== null && desde >= parametros.diasRetornoSemData) sinais.push('retorno_sem_data');
    }
    if (sinais.length > 0) saida.push({ codigo, sinais });
  }
  return saida.sort((a, b) => b.sinais.length - a.sinais.length || a.codigo.localeCompare(b.codigo));
}

// Texto do painel: só código e sinal, sem nome e sem dado de saúde.
const ROTULO_SINAL = {
  ainda_nao_seguido: 'respondeu "ainda não" seguidas vezes',
  silencio: 'sem resposta há um tempo',
  nota_escrita: 'deixou uma nota',
  retorno_sem_data: 'consulta realizada e nenhuma marcada depois',
};
function resumirPresenca(lista) {
  if (lista.length === 0) return 'Nenhum paciente pedindo atenção agora.';
  return lista.map((x) => `${x.codigo}: ${x.sinais.map((s) => ROTULO_SINAL[s]).join('; ')}`).join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { PARAMETROS_PRESENCA, calcularPresenca, resumirPresenca };
}
