'use strict';
// Item 1 (WA01, parte local): tradução entre o formato dos webhooks/mensagens da Meta (Cloud API) e o
// evento do núcleo. Exemplos só com dados inventados. Formato, limites e assinatura foram escritos de memória
// da documentação pública e PRECISAM ser conferidos na documentação vigente e na conta de teste (WA00).
// Nada aqui chama a rede.
const crypto = require('node:crypto');
const { impressao, comandoDeTexto, ehCanal, ehId } = require('../whatsapp/contrato.js');

const LIMITES = Object.freeze({
  maxEntradas: 10, maxMensagens: 50, maxCorpoBytes: 262144, // proteção contra corpo gigante
  botoes: 3, tituloBotao: 20, linhasLista: 10, tituloLinha: 24, textoCorpo: 1024, // a conferir na Meta
});
const COMANDOS_BOTAO = ['menu', 'parar', 'ver_horarios', 'falar_com_nutricionista', 'escolher_horario', 'confirmar'];

// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(segredo do app, corpo BRUTO). Conferir antes de ler o conteúdo.
function verificarAssinatura(corpoBruto, cabecalho, segredo) {
  // `segredo` pode ser uma lista (rotação: o novo e o anterior valem juntos até o anterior ser retirado).
  const segredos = (Array.isArray(segredo) ? segredo : [segredo]).filter((x) => typeof x === 'string' && x);
  if (!segredos.length || (typeof corpoBruto !== 'string' && !Buffer.isBuffer(corpoBruto))) return false;
  if (typeof cabecalho !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(cabecalho)) return false;
  const recebido = Buffer.from(cabecalho.slice(7), 'hex');
  let ok = false;
  for (const s of segredos) { // percorre todos: o tempo não revela qual segredo casou
    const esperado = crypto.createHmac('sha256', s).update(corpoBruto).digest();
    if (recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado)) ok = true;
  }
  return ok;
}
const assinar = (corpoBruto, segredo) => 'sha256=' + crypto.createHmac('sha256', segredo).update(corpoBruto).digest('hex'); // só para testes/simulador

const codificarAcao = (a) => `${a.comando}:${a.opcaoId || ''}:${a.versao === undefined ? '' : a.versao}`;
// Id de botão -> { comando, parametros } ou null. Estrito: qualquer desvio vira texto livre (sem efeito).
function decodificarAcao(id) {
  if (typeof id !== 'string' || id.length > 80) return null;
  const p = id.split(':');
  if (p.length !== 3 || !COMANDOS_BOTAO.includes(p[0])) return null;
  const parametros = {};
  if (p[1] !== '') { if (!ehId(p[1])) return null; parametros.opcaoId = p[1]; }
  if (p[2] !== '') { if (!/^\d{1,9}$/.test(p[2])) return null; parametros.versao = Number(p[2]); }
  return { comando: p[0], parametros };
}

// Normaliza o webhook. `mapaNumeros`: phone_number_id da Meta -> consultório (configuração do servidor, nunca do corpo).
// Devolve { ok, eventos: [{ eventoId, consultorioId, canalId, comando, parametros }], ignorados }.
function normalizarWebhook(corpo, mapaNumeros) {
  if (!corpo || typeof corpo !== 'object' || corpo.object !== 'whatsapp_business_account' || !Array.isArray(corpo.entry) || corpo.entry.length > LIMITES.maxEntradas) return { ok: false, codigo: 'PAYLOAD_INVALIDO' };
  const eventos = []; let ignorados = 0; let total = 0;
  for (const entrada of corpo.entry) {
    if (!entrada || !Array.isArray(entrada.changes)) return { ok: false, codigo: 'PAYLOAD_INVALIDO' };
    for (const mudanca of entrada.changes) {
      const v = mudanca && mudanca.field === 'messages' ? mudanca.value : null;
      if (!v || typeof v !== 'object') { ignorados += 1; continue; }
      const numero = v.metadata && v.metadata.phone_number_id;
      const consultorioId = typeof numero === 'string' && Object.prototype.hasOwnProperty.call(mapaNumeros || {}, numero) ? mapaNumeros[numero] : null;
      const msgs = v.messages === undefined ? [] : v.messages;
      if (!Array.isArray(msgs)) return { ok: false, codigo: 'PAYLOAD_INVALIDO' };
      if (Array.isArray(v.statuses)) ignorados += v.statuses.length; // recibos de entrega: sem efeito no núcleo
      for (const m of msgs) {
        total += 1; if (total > LIMITES.maxMensagens) return { ok: false, codigo: 'PAYLOAD_INVALIDO' };
        if (!consultorioId || !m || typeof m.id !== 'string' || !m.id || m.id.length > 200 || !ehCanal(m.from)) { ignorados += 1; continue; }
        let comando = 'texto_livre'; let parametros = {};
        if (m.type === 'text' && m.text && typeof m.text.body === 'string') comando = comandoDeTexto(m.text.body); // o corpo é descartado
        else if (m.type === 'interactive' && m.interactive) {
          const r = m.interactive.button_reply || m.interactive.list_reply;
          const a = r ? decodificarAcao(r.id) : null;
          if (a) { comando = a.comando; parametros = a.parametros; }
        }
        // id do evento estável e seguro: mesmo wamid => mesmo eventoId (deduplicação)
        eventos.push({ eventoId: 'W' + impressao({ wamid: m.id }).slice(0, 40), consultorioId, canalId: m.from, comando, parametros });
      }
    }
  }
  return { ok: true, eventos, ignorados };
}

const corta = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + '…');

// Item de saída do núcleo -> corpo da mensagem para a API da Meta (só monta; não envia).
function montarSaidaMeta(item) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: item.canalId };
  const acoes = item.acoes || [];
  const texto = corta(String(item.texto), LIMITES.textoCorpo);
  if (!acoes.length) return { ...base, type: 'text', text: { body: texto, preview_url: false } };
  if (acoes.length <= LIMITES.botoes) {
    return { ...base, type: 'interactive', interactive: { type: 'button', body: { text: texto }, action: { buttons: acoes.map((a) => ({ type: 'reply', reply: { id: codificarAcao(a), title: corta(a.rotulo, LIMITES.tituloBotao) } })) } } };
  }
  return { ...base, type: 'interactive', interactive: { type: 'list', body: { text: texto }, action: { button: 'Ver opções', sections: [{ title: 'Opções', rows: acoes.slice(0, LIMITES.linhasLista).map((a) => ({ id: codificarAcao(a), title: corta(a.rotulo, LIMITES.tituloLinha) })) }] } } };
}

module.exports = { LIMITES, verificarAssinatura, assinar, normalizarWebhook, montarSaidaMeta, codificarAcao, decodificarAcao };
