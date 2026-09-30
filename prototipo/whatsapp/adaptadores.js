'use strict';
// B1.1: adaptadores SIMULADOS (em memória). Não provam identidade no Google, persistência após perda do
// processo, entrega pela Meta nem segurança de implantação (WA02/WA03/WA09 continuam pendentes).
// Todo método é assíncrono e recebe o consultório primeiro; cada consultório tem seu próprio repositório.
const { ErroNucleo, FalhaExterna, ehCanal, ehCodigoPaciente } = require('./contrato.js');

// Pontos de falha injetáveis: armar('agenda.reservar.depois', 1) faz a próxima chamada falhar uma vez.
function criarFalhas() {
  const armadas = new Map();
  return {
    armar(ponto, vezes = 1) { armadas.set(ponto, vezes); },
    limpar() { armadas.clear(); },
    pontos() { return [...armadas.keys()]; },
    async ponto(nome) {
      const n = armadas.get(nome) || 0;
      if (n > 0) { if (n === 1) armadas.delete(nome); else armadas.set(nome, n - 1); throw new FalhaExterna(nome); }
    },
  };
}

// Com latência, cada chamada cede a vez ao laço de eventos: duas solicitações realmente se intercalam.
const cederVez = (latencia) => (latencia ? new Promise((r) => setImmediate(r)) : Promise.resolve());

// Adaptador confiável de teste: só ele fabrica contextos verificados. Um contexto criado por outra instância
// (ou montado à mão) é recusado. Isto simula a verificação do adaptador; não é autenticação de produção.
function criarAdaptadorConfiavel() {
  const emitidos = new WeakSet();
  const fabricar = (dados) => { const c = Object.freeze({ ...dados }); emitidos.add(c); return c; };
  return {
    contextoProfissional: (consultorioId, profissionalId) => fabricar({ papel: 'profissional', consultorioId, profissionalId }),
    contextoPaciente: (consultorioId, canalId) => fabricar({ papel: 'paciente', consultorioId, canalId }),
    contextoSistema: (consultorioId) => fabricar({ papel: 'sistema', consultorioId }),
    verificar: (ctx) => Boolean(ctx) && typeof ctx === 'object' && emitidos.has(ctx),
  };
}

function criarRepositorios({ latencia = false, falhas = criarFalhas() } = {}) {
  const porConsultorio = (fabrica) => { const m = new Map(); return (id) => { if (!m.has(id)) m.set(id, fabrica()); return m.get(id); }; };
  const acessos = []; // consultórios tocados, para provar que a recusa ocorre antes do acesso
  const tocar = async (cons) => { acessos.push(cons); await cederVez(latencia); };

  const cad = porConsultorio(() => ({ pacientes: new Map(), porCanal: new Map(), liberacoes: new Map() }));
  const cadastro = {
    async cadastrarPaciente(cons, { codigo, nome }) {
      await tocar(cons);
      if (!ehCodigoPaciente(codigo)) throw new ErroNucleo('PEDIDO_INVALIDO');
      const c = cad(cons);
      if (!c.pacientes.has(codigo)) c.pacientes.set(codigo, { codigo, nome: String(nome || '').slice(0, 80), canalId: null });
      return { ...c.pacientes.get(codigo) };
    },
    async obterPaciente(cons, codigo) { await tocar(cons); const p = cad(cons).pacientes.get(codigo); return p ? { ...p } : null; },
    async buscarPorCanal(cons, canalId) {
      await tocar(cons);
      const c = cad(cons); const cod = c.porCanal.get(canalId);
      return cod ? { ...c.pacientes.get(cod) } : null;
    },
    async listarPacientes(cons) { await tocar(cons); return [...cad(cons).pacientes.values()].map((p) => ({ ...p })); },
    // Liberação atômica: vínculo exato canal<->paciente, validade e versão explícitas.
    async liberar(cons, { codigo, canalId, validaAte, concedidaPor, agora }) {
      await tocar(cons);
      const c = cad(cons);
      const p = c.pacientes.get(codigo);
      if (!p) throw new ErroNucleo('PACIENTE_NAO_ENCONTRADO');
      if (!ehCanal(canalId)) throw new ErroNucleo('PEDIDO_INVALIDO');
      const dono = c.porCanal.get(canalId);
      if ((dono && dono !== codigo) || (p.canalId && p.canalId !== canalId)) throw new ErroNucleo('VINCULO_CONFLITANTE');
      p.canalId = canalId; c.porCanal.set(canalId, codigo);
      const anterior = c.liberacoes.get(codigo);
      const lib = { id: `L-${codigo}-${(anterior ? anterior.versao : 0) + 1}`, versao: (anterior ? anterior.versao : 0) + 1, concedidaEm: agora, concedidaPor, validaAte, revogadaEm: null, revogadaPor: null };
      c.liberacoes.set(codigo, lib);
      return { ...lib };
    },
    async obterLiberacao(cons, codigo) { await tocar(cons); const l = cad(cons).liberacoes.get(codigo); return l ? { ...l } : null; },
    async revogar(cons, codigo, por, agora) {
      await tocar(cons);
      const l = cad(cons).liberacoes.get(codigo);
      if (!l || l.revogadaEm) return false;
      l.revogadaEm = agora; l.revogadaPor = por; l.versao += 1;
      return true;
    },
  };

  const conv = porConsultorio(() => new Map());
  const conversas = {
    async obter(cons, codigo) { await tocar(cons); const r = conv(cons).get(codigo); return r ? JSON.parse(JSON.stringify(r)) : null; },
    // Gravação condicional: só grava se a versão ainda é a esperada (0 = não existe).
    async gravar(cons, codigo, registro, versaoEsperada) {
      await tocar(cons);
      await falhas.ponto('conversas.gravar');
      const atual = conv(cons).get(codigo);
      if ((atual ? atual.versao : 0) !== versaoEsperada) return false;
      conv(cons).set(codigo, JSON.parse(JSON.stringify({ ...registro, versao: versaoEsperada + 1 })));
      return true;
    },
  };

  const ops = porConsultorio(() => new Map());
  const operacoes = {
    async obter(cons, chave) { await tocar(cons); const o = ops(cons).get(chave); return o ? JSON.parse(JSON.stringify(o)) : null; },
    // Cria se não existir (atômico); devolve o registro existente caso contrário.
    async iniciar(cons, chave, imp, agora) {
      await tocar(cons);
      const m = ops(cons);
      if (m.has(chave)) return { criada: false, registro: JSON.parse(JSON.stringify(m.get(chave))) };
      const r = { chave, impressao: imp, estado: 'pendente', criadaEm: agora, resultado: null, paciente: null };
      m.set(chave, r);
      return { criada: true, registro: JSON.parse(JSON.stringify(r)) };
    },
    async marcarPaciente(cons, chave, codigo, comando) { await tocar(cons); const o = ops(cons).get(chave); if (o) { o.paciente = codigo; o.comando = comando; } },
    async concluir(cons, chave, resultado, estado = 'concluida') {
      await tocar(cons);
      const o = ops(cons).get(chave);
      if (o) { o.estado = estado; o.resultado = resultado; }
    },
    // Quantos eventos novos o paciente gerou desde `desde` (aproximado na simulação; produção precisa de contador atômico).
    async contarRecentes(cons, codigo, desde) { await tocar(cons); return [...ops(cons).values()].filter((o) => o.paciente === codigo && o.criadaEm >= desde).length; },
    async listarPendentes(cons) { await tocar(cons); return [...ops(cons).values()].filter((o) => o.estado === 'pendente').map((o) => ({ ...o })); },
  };

  const fila = porConsultorio(() => ({ itens: [], porChave: new Map() }));
  const saida = {
    // Idempotente pela chave de saída: repetir não duplica.
    async enfileirar(cons, msg) {
      await tocar(cons);
      const f = fila(cons);
      if (f.porChave.has(msg.chave)) return f.porChave.get(msg.chave).id;
      const item = { ...msg, id: `M${String(f.itens.length + 1).padStart(4, '0')}`, estado: 'pendente' };
      f.itens.push(item); f.porChave.set(msg.chave, item);
      return item.id;
    },
    async listar(cons) { await tocar(cons); return fila(cons).itens.map((i) => JSON.parse(JSON.stringify(i))); },
    // "Entrega" simulada: nada sai da máquina.
    async entregar(cons, id) {
      await tocar(cons);
      await falhas.ponto('saida.entregar.antes');
      const i = fila(cons).itens.find((x) => x.id === id);
      if (i && i.estado === 'pendente') i.estado = 'enviada';
    },
    async bloquear(cons, id, motivo) {
      await tocar(cons);
      const i = fila(cons).itens.find((x) => x.id === id);
      if (i && i.estado === 'pendente') { i.estado = 'bloqueada'; i.motivo = motivo; }
    },
  };

  return { cadastro, conversas, operacoes, saida, falhas, acessos, latencia };
}

module.exports = { criarFalhas, criarAdaptadorConfiavel, criarRepositorios, cederVez };
