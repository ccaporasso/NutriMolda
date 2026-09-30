'use strict';
// Item 1 (WA03, parte de desenho): SEGUNDA implementação do contrato de repositórios, modelada como uma
// planilha (abas, linhas de texto, trava de script). Serve para provar que o núcleo não depende do jeito
// "em memória" e para fixar o que um adaptador Google precisa cumprir (ver tests/bloco1-adaptador.test.js).
// NÃO chama o Google: a "planilha" é um objeto em memória. Identidade, permissões, cotas e latência reais
// continuam a provar em UI00/WA03. Limitação conhecida: a trava aqui é uma fila de promessas; o
// LockService real tem tempo limite e pode falhar (o adaptador real precisa tratar isso como falha incerta).
const { ErroNucleo, ehCanal, ehCodigoPaciente, gerarHorarios } = require('./contrato.js');
const { cederVez, criarFalhas } = require('./adaptadores.js');
const { neutralizarCelula } = require('./planilha-segura.js');

// aba -> colunas [nome, tipo]; tipos: s texto, n número, nn número ou vazio, j JSON
const ABAS = {
  Pacientes: [['codigo', 's'], ['nome', 's'], ['canalId', 's']],
  Liberacoes: [['codigo', 's'], ['id', 's'], ['versao', 'n'], ['concedidaEm', 'n'], ['concedidaPor', 's'], ['validaAte', 'n'], ['revogadaEm', 'nn'], ['revogadaPor', 's']],
  Conversas: [['codigo', 's'], ['versao', 'n'], ['dados', 'j']],
  Operacoes: [['chave', 's'], ['impressao', 's'], ['estado', 's'], ['criadaEm', 'n'], ['resultado', 'j'], ['paciente', 's'], ['comando', 's']],
  Saida: [['id', 's'], ['chave', 's'], ['dados', 'j'], ['estado', 's'], ['motivo', 's']],
  Consultas: [['id', 's'], ['pacienteCodigo', 's'], ['origemAgenda', 's'], ['inicio', 'n'], ['fim', 'n'], ['status', 's'], ['chave', 's'], ['criadaEm', 'n'], ['canceladaEm', 'nn'], ['motivo', 's'], ['substituidaPor', 's'], ['chaveCancelamento', 's']],
  Bloqueios: [['inicio', 'n'], ['fim', 'n']],
};

function codificar(tipo, v) {
  if (tipo === 'j') return JSON.stringify(v === undefined ? null : v);
  if (v === null || v === undefined) return '';
  return neutralizarCelula(String(v)); // texto nunca vira fórmula
}
function decodificar(tipo, t) {
  if (tipo === 'j') return JSON.parse(t);
  if (tipo === 'n') return Number(t);
  if (tipo === 'nn') return t === '' ? null : Number(t);
  return t === '' ? null : t;
}

function criarRepositoriosPlanilha({ latencia = false, falhas = criarFalhas(), relogio, config } = {}) {
  const planilhas = new Map(); // consultório -> { aba -> linhas (arrays de texto) }
  const travas = new Map();
  const acessos = [];
  const planilha = (cons) => { if (!planilhas.has(cons)) planilhas.set(cons, Object.fromEntries(Object.keys(ABAS).map((a) => [a, []]))); return planilhas.get(cons); };
  // Trava do consultório: serializa as seções críticas (como LockService.getScriptLock).
  const comTrava = (cons, fn) => {
    const anterior = travas.get(cons) || Promise.resolve();
    const atual = anterior.then(fn, fn);
    travas.set(cons, atual.catch(() => {}));
    return atual;
  };
  const tocar = async (cons) => { acessos.push(cons); await cederVez(latencia); };
  const linhaParaObj = (aba, linha) => Object.fromEntries(ABAS[aba].map(([n, t], i) => [n, decodificar(t, linha[i])]));
  const objParaLinha = (aba, o) => ABAS[aba].map(([n, t]) => codificar(t, o[n]));
  const todos = (cons, aba) => planilha(cons)[aba].map((l) => linhaParaObj(aba, l));
  const inserir = (cons, aba, o) => { planilha(cons)[aba].push(objParaLinha(aba, o)); };
  const indice = (cons, aba, pred) => planilha(cons)[aba].findIndex((l) => pred(linhaParaObj(aba, l)));
  const gravarLinha = (cons, aba, i, o) => { planilha(cons)[aba][i] = objParaLinha(aba, o); };
  const achar = (cons, aba, pred) => { const i = indice(cons, aba, pred); return i < 0 ? null : linhaParaObj(aba, planilha(cons)[aba][i]); };

  const cadastro = {
    async cadastrarPaciente(cons, { codigo, nome }) {
      await tocar(cons);
      if (!ehCodigoPaciente(codigo)) throw new ErroNucleo('PEDIDO_INVALIDO');
      return comTrava(cons, async () => {
        if (!achar(cons, 'Pacientes', (p) => p.codigo === codigo)) inserir(cons, 'Pacientes', { codigo, nome: String(nome || '').slice(0, 80), canalId: null });
        return achar(cons, 'Pacientes', (p) => p.codigo === codigo);
      });
    },
    async obterPaciente(cons, codigo) { await tocar(cons); return achar(cons, 'Pacientes', (p) => p.codigo === codigo); },
    async buscarPorCanal(cons, canalId) { await tocar(cons); return typeof canalId === 'string' ? achar(cons, 'Pacientes', (p) => p.canalId === canalId) : null; },
    async listarPacientes(cons) { await tocar(cons); return todos(cons, 'Pacientes'); },
    async liberar(cons, { codigo, canalId, validaAte, concedidaPor, agora }) {
      await tocar(cons);
      return comTrava(cons, async () => {
        const i = indice(cons, 'Pacientes', (p) => p.codigo === codigo);
        if (i < 0) throw new ErroNucleo('PACIENTE_NAO_ENCONTRADO');
        if (!ehCanal(canalId)) throw new ErroNucleo('PEDIDO_INVALIDO');
        const p = linhaParaObj('Pacientes', planilha(cons).Pacientes[i]);
        const dono = achar(cons, 'Pacientes', (x) => x.canalId === canalId);
        if ((dono && dono.codigo !== codigo) || (p.canalId && p.canalId !== canalId)) throw new ErroNucleo('VINCULO_CONFLITANTE');
        gravarLinha(cons, 'Pacientes', i, { ...p, canalId });
        const j = indice(cons, 'Liberacoes', (l) => l.codigo === codigo);
        const versao = j < 0 ? 1 : linhaParaObj('Liberacoes', planilha(cons).Liberacoes[j]).versao + 1;
        const lib = { codigo, id: `L-${codigo}-${versao}`, versao, concedidaEm: agora, concedidaPor, validaAte, revogadaEm: null, revogadaPor: null };
        if (j < 0) inserir(cons, 'Liberacoes', lib); else gravarLinha(cons, 'Liberacoes', j, lib);
        const { codigo: _c, ...sem } = lib; return sem;
      });
    },
    async obterLiberacao(cons, codigo) { await tocar(cons); const l = achar(cons, 'Liberacoes', (x) => x.codigo === codigo); if (!l) return null; const { codigo: _c, ...sem } = l; return sem; },
    async revogar(cons, codigo, por, agora) {
      await tocar(cons);
      return comTrava(cons, async () => {
        const j = indice(cons, 'Liberacoes', (l) => l.codigo === codigo);
        if (j < 0) return false;
        const l = linhaParaObj('Liberacoes', planilha(cons).Liberacoes[j]);
        if (l.revogadaEm !== null) return false;
        gravarLinha(cons, 'Liberacoes', j, { ...l, revogadaEm: agora, revogadaPor: por, versao: l.versao + 1 });
        return true;
      });
    },
  };

  const conversas = {
    async obter(cons, codigo) { await tocar(cons); const r = achar(cons, 'Conversas', (x) => x.codigo === codigo); return r ? { ...r.dados, versao: r.versao } : null; },
    async gravar(cons, codigo, registro, versaoEsperada) {
      await tocar(cons);
      await falhas.ponto('conversas.gravar');
      return comTrava(cons, async () => {
        const i = indice(cons, 'Conversas', (x) => x.codigo === codigo);
        const atual = i < 0 ? 0 : linhaParaObj('Conversas', planilha(cons).Conversas[i]).versao;
        if (atual !== versaoEsperada) return false;
        const { versao: _v, ...dados } = registro;
        const nova = { codigo, versao: versaoEsperada + 1, dados };
        if (i < 0) inserir(cons, 'Conversas', nova); else gravarLinha(cons, 'Conversas', i, nova);
        return true;
      });
    },
  };

  const objOp = (o) => ({ chave: o.chave, impressao: o.impressao, estado: o.estado, criadaEm: o.criadaEm, resultado: o.resultado, paciente: o.paciente, ...(o.comando ? { comando: o.comando } : {}) });
  const operacoes = {
    async obter(cons, chave) { await tocar(cons); const o = achar(cons, 'Operacoes', (x) => x.chave === chave); return o && objOp(o); },
    async iniciar(cons, chave, imp, agora) {
      await tocar(cons);
      return comTrava(cons, async () => {
        const e = achar(cons, 'Operacoes', (x) => x.chave === chave);
        if (e) return { criada: false, registro: objOp(e) };
        const r = { chave, impressao: imp, estado: 'pendente', criadaEm: agora, resultado: null, paciente: null, comando: null };
        inserir(cons, 'Operacoes', r);
        return { criada: true, registro: objOp(r) };
      });
    },
    async marcarPaciente(cons, chave, codigo, comando) { await tocar(cons); await comTrava(cons, async () => { const i = indice(cons, 'Operacoes', (x) => x.chave === chave); if (i >= 0) gravarLinha(cons, 'Operacoes', i, { ...linhaParaObj('Operacoes', planilha(cons).Operacoes[i]), paciente: codigo, comando }); }); },
    async concluir(cons, chave, resultado, estado = 'concluida') { await tocar(cons); await comTrava(cons, async () => { const i = indice(cons, 'Operacoes', (x) => x.chave === chave); if (i >= 0) gravarLinha(cons, 'Operacoes', i, { ...linhaParaObj('Operacoes', planilha(cons).Operacoes[i]), estado, resultado }); }); },
    async listarPendentes(cons) { await tocar(cons); return todos(cons, 'Operacoes').filter((o) => o.estado === 'pendente').map(objOp); },
    async contarRecentes(cons, codigo, desde) { await tocar(cons); return todos(cons, 'Operacoes').filter((o) => o.paciente === codigo && o.criadaEm >= desde).length; },
  };

  const itemSaida = (r) => ({ ...r.dados, id: r.id, estado: r.estado, ...(r.motivo ? { motivo: r.motivo } : {}) });
  const saida = {
    async enfileirar(cons, msg) {
      await tocar(cons);
      return comTrava(cons, async () => {
        const e = achar(cons, 'Saida', (x) => x.chave === msg.chave);
        if (e) return e.id;
        const id = `M${String(planilha(cons).Saida.length + 1).padStart(4, '0')}`;
        inserir(cons, 'Saida', { id, chave: msg.chave, dados: msg, estado: 'pendente', motivo: null });
        return id;
      });
    },
    async listar(cons) { await tocar(cons); return todos(cons, 'Saida').map(itemSaida); },
    async entregar(cons, id) {
      await tocar(cons);
      await falhas.ponto('saida.entregar.antes');
      await comTrava(cons, async () => { const i = indice(cons, 'Saida', (x) => x.id === id); if (i >= 0) { const r = linhaParaObj('Saida', planilha(cons).Saida[i]); if (r.estado === 'pendente') gravarLinha(cons, 'Saida', i, { ...r, estado: 'enviada' }); } });
    },
    async bloquear(cons, id, motivo) {
      await tocar(cons);
      await comTrava(cons, async () => { const i = indice(cons, 'Saida', (x) => x.id === id); if (i >= 0) { const r = linhaParaObj('Saida', planilha(cons).Saida[i]); if (r.estado === 'pendente') gravarLinha(cons, 'Saida', i, { ...r, estado: 'bloqueada', motivo }); } });
    },
  };

  const sobrepoe = (a, b) => a.inicio < b.fim && b.inicio < a.fim;
  const ocupados = (cons) => [...todos(cons, 'Consultas').filter((c) => c.status === 'confirmada'), ...todos(cons, 'Bloqueios')];
  const consulta = (cons, c) => (c ? { id: c.id, consultorioId: cons, pacienteCodigo: c.pacienteCodigo, origemAgenda: c.origemAgenda, inicio: c.inicio, fim: c.fim, status: c.status, chave: c.chave, criadaEm: c.criadaEm, canceladaEm: c.canceladaEm, motivo: c.motivo, substituidaPor: c.substituidaPor, chaveCancelamento: c.chaveCancelamento } : null);
  const agenda = {
    async listarDisponiveis(cons, quantidade, excluirIds = []) {
      await tocar(cons);
      const ocup = ocupados(cons);
      return gerarHorarios(relogio.agora(), config).filter((h) => !ocup.some((o) => sobrepoe(h, o))).filter((h) => !excluirIds.includes(`h${Math.floor(h.inicio / 60000)}`)).slice(0, quantidade);
    },
    async estaDisponivel(cons, inicio, fim) { await tocar(cons); return !ocupados(cons).some((o) => sobrepoe({ inicio, fim }, o)); },
    async reservar(cons, { chave, pacienteCodigo, inicio, fim }) {
      await tocar(cons);
      await falhas.ponto('agenda.reservar.antes');
      const grade = gerarHorarios(relogio.agora(), { ...config, antecedenciaMin: 0 });
      if (!Number.isInteger(inicio) || !Number.isInteger(fim) || fim <= inicio || inicio <= relogio.agora() || !grade.some((h) => h.inicio === inicio && h.fim === fim)) throw new ErroNucleo('PEDIDO_INVALIDO');
      const resultado = await comTrava(cons, async () => {
        await cederVez(latencia); // a trava garante a atomicidade mesmo com pausa entre conferir e gravar
        const igual = achar(cons, 'Consultas', (c) => c.chave === chave);
        if (igual) return { estado: 'existente', consulta: consulta(cons, igual) };
        const dele = achar(cons, 'Consultas', (c) => c.pacienteCodigo === pacienteCodigo && c.status === 'confirmada' && c.fim > relogio.agora());
        if (dele) return { estado: 'paciente_ja_tem', consulta: consulta(cons, dele) };
        if (ocupados(cons).some((o) => sobrepoe({ inicio, fim }, o))) return { estado: 'conflito' };
        const nova = { id: `C${String(planilha(cons).Consultas.length + 1).padStart(4, '0')}`, pacienteCodigo, origemAgenda: 'planilha_simulada', inicio, fim, status: 'confirmada', chave, criadaEm: relogio.agora(), canceladaEm: null };
        inserir(cons, 'Consultas', nova);
        return { estado: 'reservada', consulta: consulta(cons, nova) };
      });
      await falhas.ponto('agenda.reservar.depois');
      return resultado;
    },
    async cancelar(cons, { chave, consultaId, pacienteCodigo = null, motivo = 'cancelada' }) {
      await tocar(cons);
      await falhas.ponto('agenda.cancelar.antes');
      const resultado = await comTrava(cons, async () => {
        const i = indice(cons, 'Consultas', (x) => x.id === consultaId);
        const c = i < 0 ? null : linhaParaObj('Consultas', planilha(cons).Consultas[i]);
        if (!c || (pacienteCodigo && c.pacienteCodigo !== pacienteCodigo)) return { estado: 'nao_encontrada' };
        if (c.status === 'cancelada') return { estado: c.chaveCancelamento === chave ? 'existente' : 'ja_cancelada', consulta: consulta(cons, c) };
        if (c.fim <= relogio.agora()) return { estado: 'passada', consulta: consulta(cons, c) };
        const n = { ...c, status: 'cancelada', canceladaEm: relogio.agora(), motivo, chaveCancelamento: chave };
        gravarLinha(cons, 'Consultas', i, n);
        return { estado: 'cancelada', consulta: consulta(cons, n) };
      });
      await falhas.ponto('agenda.cancelar.depois');
      return resultado;
    },
    async buscarCancelamentoPorChave(cons, chave) { await tocar(cons); return consulta(cons, achar(cons, 'Consultas', (c) => c.chaveCancelamento === chave)); },
    async remarcar(cons, { chave, consultaId, pacienteCodigo, inicio, fim }) {
      await tocar(cons);
      await falhas.ponto('agenda.reservar.antes');
      const grade = gerarHorarios(relogio.agora(), { ...config, antecedenciaMin: 0 });
      if (!Number.isInteger(inicio) || !Number.isInteger(fim) || fim <= inicio || inicio <= relogio.agora() || !grade.some((h) => h.inicio === inicio && h.fim === fim)) throw new ErroNucleo('PEDIDO_INVALIDO');
      const resultado = await comTrava(cons, async () => {
        await cederVez(latencia);
        const igual = achar(cons, 'Consultas', (c) => c.chave === chave);
        if (igual) return { estado: 'existente', consulta: consulta(cons, igual) };
        const i = indice(cons, 'Consultas', (x) => x.id === consultaId);
        const antiga = i < 0 ? null : linhaParaObj('Consultas', planilha(cons).Consultas[i]);
        if (!antiga || antiga.pacienteCodigo !== pacienteCodigo || antiga.status !== 'confirmada') return { estado: 'nao_encontrada' };
        if (antiga.fim <= relogio.agora()) return { estado: 'passada' };
        if (antiga.inicio === inicio) return { estado: 'mesmo_horario', consulta: consulta(cons, antiga) };
        if ([...todos(cons, 'Consultas').filter((c) => c.status === 'confirmada' && c.id !== consultaId), ...todos(cons, 'Bloqueios')].some((o) => sobrepoe({ inicio, fim }, o))) return { estado: 'conflito' };
        const nova = { id: `C${String(planilha(cons).Consultas.length + 1).padStart(4, '0')}`, pacienteCodigo, origemAgenda: 'planilha_simulada', inicio, fim, status: 'confirmada', chave, criadaEm: relogio.agora(), canceladaEm: null };
        const velha = { ...antiga, status: 'cancelada', canceladaEm: relogio.agora(), motivo: 'remarcada', substituidaPor: nova.id, chaveCancelamento: chave };
        gravarLinha(cons, 'Consultas', i, velha); inserir(cons, 'Consultas', nova);
        return { estado: 'remarcada', consulta: consulta(cons, nova), anterior: consulta(cons, velha) };
      });
      await falhas.ponto('agenda.reservar.depois');
      return resultado;
    },
    async buscarPorChave(cons, chave) { await tocar(cons); return consulta(cons, achar(cons, 'Consultas', (c) => c.chave === chave)); },
    async obterConsulta(cons, id) { await tocar(cons); return consulta(cons, achar(cons, 'Consultas', (c) => c.id === id)); },
    async listarConsultas(cons) { await tocar(cons); return todos(cons, 'Consultas').map((c) => consulta(cons, c)).sort((a, b) => a.inicio - b.inicio); },
    async consultaAtiva(cons, pacienteCodigo) { await tocar(cons); return consulta(cons, achar(cons, 'Consultas', (c) => c.pacienteCodigo === pacienteCodigo && c.status === 'confirmada' && c.fim > relogio.agora())); },
    bloquear(cons, inicio, fim) { inserir(cons, 'Bloqueios', { inicio, fim }); },
  };

  return { cadastro, conversas, operacoes, saida, agenda, falhas, acessos, latencia, _planilha: planilha };
}

module.exports = { criarRepositoriosPlanilha, ABAS };
