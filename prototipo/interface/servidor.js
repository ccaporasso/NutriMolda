'use strict';
// B1.3: servidor local da demonstração. Só escuta em 127.0.0.1, sem dependências, sem rede externa.
// Uso: node prototipo/interface/servidor.js   (porta 4173; PORT=outra muda)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { criarDemo } = require('./api.js');

const ESTATICOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/estilo.css': ['estilo.css', 'text/css; charset=utf-8'],
};
const CABECALHOS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
};

async function criarServidor({ inicio } = {}) {
  const demo = await criarDemo({ inicio });
  let porta = 0;
  const hostOk = (h) => typeof h === 'string' && new RegExp(`^(127\\.0\\.0\\.1|localhost):${porta}$`).test(h);

  const servidor = http.createServer((req, res) => {
    const responder = (status, tipo, corpo) => { res.writeHead(status, { 'Content-Type': tipo, ...CABECALHOS }); res.end(corpo); };
    const json = (status, obj) => responder(status, 'application/json; charset=utf-8', JSON.stringify(obj));
    if (!hostOk(req.headers.host)) return json(403, { ok: false, codigo: 'CONTEXTO_INVALIDO', mensagem: 'Acesso não permitido.' });
    const caminho = (req.url || '').split('?')[0];

    if (req.method === 'GET' && ESTATICOS[caminho]) {
      const [arquivo, tipo] = ESTATICOS[caminho];
      return responder(200, tipo, fs.readFileSync(path.join(__dirname, arquivo)));
    }
    if (caminho === '/favicon.ico') { res.writeHead(204, CABECALHOS); return res.end(); }
    if (!caminho.startsWith('/api/')) return json(404, { ok: false, codigo: 'NAO_ENCONTRADA', mensagem: 'Não encontrado.' });
    if (req.method === 'POST') {
      // Exige cabeçalho próprio e JSON: um site qualquer não consegue enviar isso sem pré-verificação (que não respondemos).
      if (req.headers['x-demo'] !== '1' || !/^application\/json/.test(req.headers['content-type'] || '')) return json(403, { ok: false, codigo: 'CONTEXTO_INVALIDO', mensagem: 'Pedido não permitido.' });
      let corpo = ''; let estourou = false;
      req.on('data', (d) => { corpo += d; if (corpo.length > 10000) { estourou = true; req.destroy(); } });
      req.on('end', async () => {
        if (estourou) return;
        let obj;
        try { obj = corpo ? JSON.parse(corpo) : {}; } catch (e) { return json(400, { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'O pedido está incompleto ou fora do formato esperado.' }); }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return json(400, { ok: false, codigo: 'PEDIDO_INVALIDO', mensagem: 'O pedido está incompleto ou fora do formato esperado.' });
        try { const r = await demo.tratar('POST', caminho, obj); json(r.status, r.json); } catch (e) { json(500, { ok: false, codigo: 'ERRO_INTERNO', mensagem: 'Ocorreu um erro inesperado.' }); }
      });
      return undefined;
    }
    demo.tratar(req.method, caminho, null).then((r) => json(r.status, r.json), () => json(500, { ok: false, codigo: 'ERRO_INTERNO', mensagem: 'Ocorreu um erro inesperado.' }));
    return undefined;
  });

  return {
    servidor,
    ouvir: (p = 0) => new Promise((ok) => servidor.listen(p, '127.0.0.1', () => { porta = servidor.address().port; ok(porta); })),
    fechar: () => new Promise((ok) => servidor.close(ok)),
  };
}

if (require.main === module) {
  criarServidor().then((s) => s.ouvir(Number(process.env.PORT) || 4173)).then((p) => {
    console.log(`Demonstração (dados fictícios) em http://127.0.0.1:${p}/  — Ctrl+C para encerrar.`);
  });
}

module.exports = { criarServidor };
