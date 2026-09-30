'use strict';
// Item 2 (WA02, parte local): ponte simulada com aceitação DURÁVEL. A ordem é: verificar assinatura -> normalizar
// -> gravar no diário em disco (fsync) -> só então responder 200. Processamento e saída são etapas separadas e
// recuperáveis. O diário é um arquivo local descartável: NÃO é a persistência de produção (WA09 segue aberta).
// O diário guarda o mínimo: id do evento, consultório, identificador do canal, comando e parâmetros. Nunca o
// corpo da mensagem. O identificador do canal identifica pessoa: retenção e descarte são definidos em `compactar`.
const fs = require('node:fs');
const path = require('node:path');
const { verificarAssinatura, normalizarWebhook, montarSaidaMeta, LIMITES } = require('./meta.js');
const { situacaoLiberacao } = require('../whatsapp/nucleo.js');

const DIARIO = 'diario.jsonl';

function criarPonte({ pasta, segredoApp, segredosApp, mapaNumeros, nucleo, confiavel, repos, relogio, transporte, maxTentativas = 5, gravar: gravarExterno }) {
  fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
  const arquivo = path.join(pasta, DIARIO);

  function gravarDuravel(linha) {
    const fd = fs.openSync(arquivo, 'a', 0o600);
    try { fs.writeSync(fd, linha + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }

  const gravar = gravarExterno || gravarDuravel; // o teste injeta uma gravação que falha

  // Lê o diário; linha final incompleta (queda no meio da escrita) é ignorada.
  function ler() {
    if (!fs.existsSync(arquivo)) return [];
    const out = [];
    for (const l of fs.readFileSync(arquivo, 'utf8').split('\n')) { if (!l) continue; try { out.push(JSON.parse(l)); } catch (e) { /* linha torta */ } }
    return out;
  }
  const estado = () => {
    const aceitos = new Map(); const feitos = new Set(); const tentativas = new Map(); const saidas = new Set();
    for (const r of ler()) {
      if (r.t === 'aceito') aceitos.set(r.id, r);
      else if (r.t === 'feito') feitos.add(r.id);
      else if (r.t === 'tentativa') tentativas.set(r.id, (tentativas.get(r.id) || 0) + 1);
      else if (r.t === 'saida') saidas.add(r.id);
    }
    return { aceitos, feitos, tentativas, saidas };
  };

  // 1) Recebimento. Devolve o status HTTP que o servidor real responderia à Meta.
  function receber(corpoBruto, cabecalhoAssinatura) {
    if (!verificarAssinatura(corpoBruto, cabecalhoAssinatura, segredosApp || segredoApp)) return { status: 401 }; // antes de ler o conteúdo
    if (Buffer.byteLength(corpoBruto) > LIMITES.maxCorpoBytes) return { status: 413 };
    let obj; try { obj = JSON.parse(corpoBruto); } catch (e) { return { status: 400 }; }
    const n = normalizarWebhook(obj, mapaNumeros);
    if (!n.ok) return { status: 400 };
    const { aceitos } = estado(); let novos = 0;
    try {
      for (const ev of n.eventos) {
        if (aceitos.has(ev.eventoId)) continue; // reenvio da Meta: já aceito
        gravar(JSON.stringify({ t: 'aceito', id: ev.eventoId, em: relogio.agora(), cons: ev.consultorioId, canal: ev.canalId, comando: ev.comando, parametros: ev.parametros }));
        aceitos.set(ev.eventoId, ev); novos += 1;
      }
    } catch (e) { return { status: 503 }; } // não gravou: NÃO confirma, a Meta tenta de novo
    return { status: 200, novos, ignorados: n.ignorados };
  }

  // 2) Processamento: em ordem de chegada, pelo núcleo. Reprocessar é seguro (o núcleo deduplica pelo eventoId).
  async function processarPendentes() {
    const { aceitos, feitos, tentativas } = estado();
    const resumo = { processados: 0, pendentes: 0, falhos: 0 };
    for (const [id, ev] of aceitos) {
      if (feitos.has(id)) continue;
      const ctx = confiavel.contextoPaciente(ev.cons, ev.canal);
      const r = await nucleo.processarEventoPaciente(ctx, { consultorioId: ev.cons, eventoId: id, comando: ev.comando, parametros: ev.parametros });
      if (r.ok === false && r.tentarDeNovo) {
        gravar(JSON.stringify({ t: 'tentativa', id }));
        if ((tentativas.get(id) || 0) + 1 >= maxTentativas) { gravar(JSON.stringify({ t: 'feito', id, r: 'falhou' })); resumo.falhos += 1; } else resumo.pendentes += 1;
        continue;
      }
      gravar(JSON.stringify({ t: 'feito', id, r: r.ok === false ? r.codigo : (r.tipo || 'ok') }));
      resumo.processados += 1;
    }
    return resumo;
  }

  // 3) Saída: monta o corpo da Meta e entrega ao transporte SIMULADO, revalidando autorização antes de cada envio.
  async function enviarSaidas() {
    const { saidas } = estado(); const resumo = { enviadas: 0, bloqueadas: 0, pendentes: 0 };
    for (const cons of new Set([...estado().aceitos.values()].map((a) => a.cons))) {
      for (const item of await repos.saida.listar(cons)) {
        if (item.estado !== 'enviada' || saidas.has(`${cons}/${item.id}`)) continue;
        if (!item.sempre) {
          const lib = await repos.cadastro.obterLiberacao(cons, item.pacienteCodigo);
          const conv = await repos.conversas.obter(cons, item.pacienteCodigo);
          if (situacaoLiberacao(lib, relogio.agora()) !== 'ativa' || (conv && (conv.estado === 'atendimento_humano' || conv.estado === 'revogado'))) { gravar(JSON.stringify({ t: 'saida', id: `${cons}/${item.id}`, r: 'bloqueada' })); resumo.bloqueadas += 1; continue; }
        }
        try { await transporte.enviar(montarSaidaMeta(item)); } catch (e) { resumo.pendentes += 1; continue; }
        gravar(JSON.stringify({ t: 'saida', id: `${cons}/${item.id}`, r: 'enviada' })); resumo.enviadas += 1;
      }
    }
    return resumo;
  }

  // Retenção: descarta eventos já concluídos mais antigos que a janela. A janela precisa cobrir o maior prazo de
  // reenvio da Meta (a conferir); fora dela, um reenvio viraria "novo" (o núcleo ainda barra repetição de consulta).
  function compactar(retencaoMs) {
    const { feitos } = estado(); const limite = relogio.agora() - retencaoMs;
    const todos = ler();
    const velhos = new Set(todos.filter((r) => r.t === 'aceito' && feitos.has(r.id) && r.em < limite).map((r) => r.id));
    const final = todos.filter((r) => !velhos.has(r.id));
    fs.writeFileSync(arquivo, final.map((r) => JSON.stringify(r)).join('\n') + (final.length ? '\n' : ''), { mode: 0o600 });
    return { removidos: velhos.size };
  }

  return { receber, processarPendentes, enviarSaidas, compactar, diario: ler, arquivo };
}

module.exports = { criarPonte };
