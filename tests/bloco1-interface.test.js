// B1.3 (D44): interface local e simulador usando o mesmo núcleo. Dados inventados, servidor só em 127.0.0.1.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { criarDemo } = require('../prototipo/interface/api.js');
const { criarServidor } = require('../prototipo/interface/servidor.js');

const INICIO = '2026-10-01T12:00:00Z';
const pasta = path.join(__dirname, '..', 'prototipo', 'interface');

async function api(demo, metodo, caminho, corpo) { const r = await demo.tratar(metodo, caminho, corpo); return { ...r.json, _status: r.status }; }
const botaoDe = (estado, cod, tipo) => { const m = estado.mensagens.filter((x) => x.pacienteCodigo === cod && x.tipo === tipo); return m[m.length - 1].acoes; };
const evento = (demo, cod, a) => api(demo, 'POST', '/api/paciente/evento', { codigoPaciente: cod, comando: a.comando, parametros: a.comando === 'ver_horarios' ? undefined : { opcaoId: a.opcaoId, versao: a.versao } });

test('percurso completo pela API da interface: liberar -> agendar -> ver -> encaminhar e pausar', async () => {
  const demo = await criarDemo({ inicio: INICIO });
  let e = await api(demo, 'GET', '/api/estado');
  assert.equal(e.ficticio, true); assert.equal(e.consultas.length, 0);
  assert.equal((await api(demo, 'POST', '/api/paciente/evento', { codigoPaciente: 'F001', texto: 'menu' })).tipo, 'sem_efeito');
  assert.equal((await api(demo, 'POST', '/api/profissional/liberar', { codigoPaciente: 'F001', dias: 30 })).ok, true);
  await api(demo, 'POST', '/api/paciente/evento', { codigoPaciente: 'F001', comando: 'ver_horarios' });
  e = await api(demo, 'GET', '/api/estado');
  await evento(demo, 'F001', botaoDe(e, 'F001', 'opcoes_horario')[0]);
  e = await api(demo, 'GET', '/api/estado');
  const r = await evento(demo, 'F001', botaoDe(e, 'F001', 'pedir_confirmacao')[0]);
  assert.equal(r.acao, 'consulta_confirmada');
  e = await api(demo, 'GET', '/api/estado');
  assert.equal(e.consultas.length, 1); assert.match(e.consultas[0].inicioTexto, /\d{2}\/\d{2} às \d{2}:\d{2}/);
  const det = await api(demo, 'GET', `/api/consultas/${e.consultas[0].id}`);
  assert.equal(det.consulta.pacienteNome, 'Paciente Fictícia Um');
  const h = await api(demo, 'POST', '/api/paciente/evento', { codigoPaciente: 'F001', comando: 'falar_com_nutricionista' });
  assert.equal(h.estado, 'atendimento_humano');
  e = await api(demo, 'GET', '/api/estado');
  assert.equal(e.pacientes[0].atencao, true);
  assert.equal((await api(demo, 'POST', '/api/paciente/evento', { codigoPaciente: 'F001', texto: 'MENU' })).tipo, 'sem_efeito');
  assert.equal((await api(demo, 'POST', '/api/profissional/retomar', { codigoPaciente: 'F001' })).estado, 'menu');
});

test('a interface usa o mesmo núcleo: o que a API grava é o que o núcleo enxerga', async () => {
  const demo = await criarDemo({ inicio: INICIO });
  await api(demo, 'POST', '/api/profissional/liberar', { codigoPaciente: 'F002' });
  const cen = demo.cenario();
  const l = await cen.nucleo.listarPacientes(cen.prof, { consultorioId: 'CONS-A' });
  assert.equal(l.pacientes.find((p) => p.codigo === 'F002').liberacao, 'ativa');
});

test('estados de erro e conflito: pedidos inválidos, horário ocupado por fora e falha injetada', async () => {
  const demo = await criarDemo({ inicio: INICIO });
  for (const corpo of [{}, { codigoPaciente: 'NAO' }, { codigoPaciente: '<b>x</b>' }]) assert.equal((await api(demo, 'POST', '/api/profissional/liberar', corpo))._status, 400);
  assert.equal((await api(demo, 'POST', '/api/demo/ocupar', { codigoPaciente: 'F001' }))._status, 422);
  assert.equal((await api(demo, 'POST', '/api/demo/falha', { ponto: 'rede.real' }))._status, 400);
  assert.equal((await api(demo, 'POST', '/api/demo/avancar', { horas: -1 }))._status, 400);
  await api(demo, 'POST', '/api/profissional/liberar', { codigoPaciente: 'F001' });
  await api(demo, 'POST', '/api/paciente/evento', { codigoPaciente: 'F001', comando: 'ver_horarios' });
  let e = await api(demo, 'GET', '/api/estado');
  await api(demo, 'POST', '/api/demo/ocupar', { codigoPaciente: 'F001' });
  const r = await evento(demo, 'F001', botaoDe(e, 'F001', 'opcoes_horario')[0]);
  assert.equal(r.acao, 'conflito');
  e = await api(demo, 'GET', '/api/estado');
  await evento(demo, 'F001', botaoDe(e, 'F001', 'opcoes_horario').slice(-1)[0]);
  await api(demo, 'POST', '/api/demo/falha', { ponto: 'agenda.reservar.antes' });
  e = await api(demo, 'GET', '/api/estado');
  assert.deepEqual(e.falhasArmadas, ['agenda.reservar.antes']);
  const f = await evento(demo, 'F001', botaoDe(e, 'F001', 'pedir_confirmacao')[0]);
  assert.equal(f.ok, false); assert.equal(f.tentarDeNovo, true);
  e = await api(demo, 'GET', '/api/estado'); assert.equal(e.pendencias, 1); assert.equal(e.consultas.length, 0);
});

test('reiniciar a demonstração apaga só os dados fictícios e volta ao começo', async () => {
  const demo = await criarDemo({ inicio: INICIO });
  await api(demo, 'POST', '/api/profissional/liberar', { codigoPaciente: 'F001' });
  await api(demo, 'POST', '/api/demo/avancar', { horas: 5 });
  await api(demo, 'POST', '/api/demo/reiniciar');
  const e = await api(demo, 'GET', '/api/estado');
  assert.equal(e.pacientes[0].liberacao, 'nenhuma'); assert.equal(e.mensagens.length, 0);
});

test('consulta inexistente ou com id malformado: 404 neutro', async () => {
  const demo = await criarDemo({ inicio: INICIO });
  assert.equal((await api(demo, 'GET', '/api/consultas/C9999'))._status, 404);
  assert.equal((await api(demo, 'GET', '/api/consultas/..%2Fx'))._status, 404);
});

test('nome com marcação HTML trafega como dado e a interface só usa textContent (sem innerHTML, eval ou recursos externos)', async () => {
  const demo = await criarDemo({ inicio: INICIO });
  const cen = demo.cenario();
  await cen.nucleo.cadastrarPaciente(cen.prof, { consultorioId: 'CONS-A', codigoPaciente: 'F099', nome: '<img src=x onerror=alert(1)>' });
  const e = await api(demo, 'GET', '/api/estado');
  assert.equal(e.pacientes.find((p) => p.codigo === 'F099').nome, '<img src=x onerror=alert(1)>');
  const js = fs.readFileSync(path.join(pasta, 'app.js'), 'utf8');
  for (const proibido of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\(/, /new Function/]) assert.doesNotMatch(js, proibido);
  const todos = ['index.html', 'app.js', 'estilo.css'].map((f) => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n');
  assert.doesNotMatch(todos, /https?:\/\//, 'sem CDN, fonte ou telemetria externos');
  assert.doesNotMatch(fs.readFileSync(path.join(pasta, 'index.html'), 'utf8'), /<script(?![^>]*src=)[^>]*>/, 'sem script inline');
  assert.match(fs.readFileSync(path.join(pasta, 'index.html'), 'utf8'), /dados fictícios/i);
});

test('acessibilidade básica: idioma, rótulos, região viva e botões com nome', () => {
  const html = fs.readFileSync(path.join(pasta, 'index.html'), 'utf8');
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<label for="quem">/); assert.match(html, /<label for="texto">/);
  assert.match(html, /aria-live="polite"/); assert.match(html, /role="status"/);
});

function pedir(porta, { metodo = 'GET', caminho = '/', cabecalhos = {}, corpo } = {}) {
  return new Promise((ok, erro) => {
    const r = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho, headers: { Host: `127.0.0.1:${porta}`, ...cabecalhos } }, (res) => {
      let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, corpo: t }));
    });
    r.on('error', erro); if (corpo) r.write(corpo); r.end();
  });
}

test('servidor local: escuta só em 127.0.0.1, serve a página e recusa Host estranho e POST sem cabeçalho da demonstração', async () => {
  const s = await criarServidor({ inicio: INICIO });
  const porta = await s.ouvir(0);
  try {
    assert.equal(s.servidor.address().address, '127.0.0.1');
    const pag = await pedir(porta, { caminho: '/' });
    assert.equal(pag.status, 200); assert.match(pag.corpo, /DEMONSTRAÇÃO/); assert.match(pag.headers['content-security-policy'], /default-src 'self'/);
    assert.equal((await pedir(porta, { caminho: '/api/estado', cabecalhos: { Host: 'evil.example' } })).status, 403);
    assert.equal((await pedir(porta, { metodo: 'POST', caminho: '/api/demo/reiniciar', corpo: '{}', cabecalhos: { 'Content-Type': 'application/json' } })).status, 403);
    assert.equal((await pedir(porta, { metodo: 'POST', caminho: '/api/demo/reiniciar', corpo: '{}', cabecalhos: { 'Content-Type': 'text/plain', 'X-Demo': '1' } })).status, 403);
    assert.equal((await pedir(porta, { metodo: 'POST', caminho: '/api/demo/reiniciar', corpo: '{quebrado', cabecalhos: { 'Content-Type': 'application/json', 'X-Demo': '1' } })).status, 400);
    assert.equal((await pedir(porta, { caminho: '/../../etc/passwd' })).status, 404);
    assert.equal((await pedir(porta, { caminho: '/estado.json' })).status, 404);
    const ok = await pedir(porta, { metodo: 'POST', caminho: '/api/profissional/liberar', corpo: JSON.stringify({ codigoPaciente: 'F001' }), cabecalhos: { 'Content-Type': 'application/json', 'X-Demo': '1' } });
    assert.equal(ok.status, 200);
    assert.equal(JSON.parse((await pedir(porta, { caminho: '/api/estado' })).corpo).pacientes[0].liberacao, 'ativa');
  } finally { await s.fechar(); }
});

test('interface: atenção, cancelamento pela profissional, operações pendentes e cena de disputa usam o mesmo núcleo', async () => {
  const demo = await criarDemo({ inicio: INICIO });
  await api(demo, 'POST', '/api/profissional/liberar', { codigoPaciente: 'F001' });
  await api(demo, 'POST', '/api/paciente/evento', { codigoPaciente: 'F001', comando: 'falar_com_nutricionista' });
  let e = await api(demo, 'GET', '/api/estado');
  assert.ok(e.atencao.some((p) => p.codigo === 'F001' && p.sinais[0].tipo === 'atendimento_humano'));
  await api(demo, 'POST', '/api/profissional/retomar', { codigoPaciente: 'F001' });
  const d = await api(demo, 'POST', '/api/demo/disputa');
  assert.equal(d.ok, true);
  assert.deepEqual(d.resultados.map((r) => r.acao).sort(), ['conflito', 'consulta_confirmada']);
  e = await api(demo, 'GET', '/api/estado');
  assert.equal(e.consultas.filter((c) => c.status === 'confirmada').length, 1);
  assert.equal((await api(demo, 'POST', '/api/demo/disputa'))._status, 422, 'não repete a cena sobre quem já tem consulta');
  const id = e.consultas[0].id;
  assert.equal((await api(demo, 'POST', '/api/profissional/cancelar-consulta', { consultaId: id })).acao, 'consulta_cancelada');
  assert.equal((await api(demo, 'POST', '/api/profissional/cancelar-consulta', { consultaId: 5 }))._status, 400);
  assert.equal((await api(demo, 'POST', '/api/profissional/cancelar-consulta', { consultaId: 'C9999' }))._status, 422);
  e = await api(demo, 'GET', '/api/estado');
  assert.equal(e.consultas[0].status, 'cancelada'); assert.ok(e.consultas[0].canceladaEmTexto);
  // operação pendente aparece com comando e paciente, sem telefone nem texto
  await api(demo, 'POST', '/api/demo/falha', { ponto: 'agenda.cancelar.antes' });
  await api(demo, 'POST', '/api/paciente/evento', { codigoPaciente: 'F003', comando: 'ver_horarios' });
  e = await api(demo, 'GET', '/api/estado');
  assert.ok(Array.isArray(e.operacoesPendentes));
  assert.doesNotMatch(JSON.stringify(e.operacoesPendentes), /5511/);
});
