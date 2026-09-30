'use strict';
// Interface da demonstração local (B1.3). Todo texto vindo do servidor entra por textContent:
// nomes ou mensagens com marcação HTML aparecem como texto e nunca executam.
(function () {
  const $ = (id) => document.getElementById(id);
  const estado = { dados: null, quem: null, local: {}, erro: null };

  const MOTIVOS = {
    sem_liberacao: 'Sem liberação ativa (ou expirada/revogada): nada foi feito e nada foi enviado.',
    fora_da_etapa: 'Esse comando não vale nesta etapa da conversa: nada foi feito.',
    versao_antiga: 'Resposta antiga de botão: ignorada, nada foi feito.',
    opcao_invalida: 'Opção inexistente: ignorada, nada foi feito.',
    horario_passado: 'Esse horário já passou: nada foi reservado.',
    pedido_incompleto: 'Pedido incompleto: nada foi feito.',
    sem_consulta: 'Esta paciente não tem consulta para isso: nada foi feito.',
    consulta_cancelada: 'Essa consulta já foi cancelada: nada foi feito.',
    mesmo_horario: 'É o mesmo horário da consulta atual: nada foi feito.',
    limite_de_frequencia: 'Muitas mensagens em pouco tempo: ignorado em silêncio.',
    consulta_mantida_sem_liberacao: 'A consulta foi mantida, mas não há envio automático sem liberação.',
  };
  const ACOES = {
    consulta_confirmada: 'Consulta confirmada.', consulta_ja_confirmada: 'Essa consulta já estava confirmada (nada foi duplicado).',
    disputa: 'Cena executada: as duas pacientes confirmaram o mesmo horário ao mesmo tempo. Uma ficou com ele; a outra recebeu o aviso de conflito e novas opções (veja no simulador).',
    consulta_remarcada: 'Consulta remarcada (a antiga ficou cancelada). A cobrança não foi alterada.', consulta_cancelada: 'Consulta cancelada. A cobrança não foi alterada.', aguardando_cancelamento: 'Aguardando a confirmação do cancelamento.',
    conflito: 'Conflito: o horário acabou de ser ocupado. Novas opções foram oferecidas.', encaminhado_humano: 'Encaminhado à nutricionista. A automação está pausada.',
    parado: 'Paciente pediu PARAR: a liberação foi revogada.', sem_horarios: 'Não há horários livres.', ja_tem_consulta: 'Esta paciente já tem consulta.',
  };

  function aviso(texto, tipo) {
    const el = $('aviso');
    el.textContent = texto || ''; el.hidden = !texto;
    el.className = 'aviso' + (tipo ? ' ' + tipo : '');
  }
  function resumo(r) {
    if (!r) return null;
    if (r.ok === false) return [r.tentarDeNovo ? 'Falhou agora e nada foi confirmado; tente de novo ou use "Reconciliar pendências". ' + r.mensagem : r.mensagem, 'erro'];
    if (r.tipo === 'sem_efeito') return [MOTIVOS[r.motivo] || 'Nada foi feito.', null];
    if (r.acao === 'conflito') return [ACOES.conflito, 'conflito'];
    return [ACOES[r.acao] || (r.repetido ? 'Pedido repetido: nada foi duplicado.' : null), null];
  }

  async function chamar(metodo, caminho, corpo) {
    const opc = { method: metodo, headers: {} };
    if (metodo === 'POST') { opc.headers['Content-Type'] = 'application/json'; opc.headers['X-Demo'] = '1'; opc.body = JSON.stringify(corpo || {}); }
    const resp = await fetch(caminho, opc);
    return resp.json();
  }

  function el(tag, texto, atributos) {
    const e = document.createElement(tag);
    if (texto !== undefined && texto !== null) e.textContent = texto;
    for (const k of Object.keys(atributos || {})) e.setAttribute(k, atributos[k]);
    return e;
  }
  function botao(rotulo, onclick, extra) {
    const b = el('button', rotulo, { type: 'button', ...(extra || {}) });
    b.addEventListener('click', onclick);
    return b;
  }

  async function agir(fn) {
    try {
      const r = await fn();
      const s = resumo(r);
      if (s && s[0]) aviso(s[0], s[1]); else aviso('');
    } catch (e) { aviso('Não foi possível falar com a demonstração. Verifique se o servidor local está aberto.', 'erro'); }
    await carregar();
  }

  function desenharAtencao() {
    const cont = $('atencao'); cont.textContent = '';
    const l = estado.dados.atencao || [];
    if (!l.length) { cont.appendChild(el('p', 'Ninguém precisa de atenção agora.', { class: 'vazio' })); return; }
    const ul = el('ul');
    for (const p of l) {
      const li = el('li'); li.appendChild(el('strong', `${p.nome} (${p.codigo})`));
      const sub = el('ul'); for (const s of p.sinais) sub.appendChild(el('li', s.texto));
      li.appendChild(sub); ul.appendChild(li);
    }
    cont.appendChild(ul);
  }

  function desenharPendentes() {
    const cont = $('pendentes'); cont.textContent = '';
    const l = estado.dados.operacoesPendentes || [];
    if (!l.length) { cont.appendChild(el('p', 'Nenhuma operação pendente.', { class: 'vazio' })); return; }
    const ul = el('ul');
    for (const o of l) ul.appendChild(el('li', `${o.pacienteCodigo || '—'}: ${o.comando || 'operação'} sem conclusão desde ${o.desdeTexto}`));
    cont.appendChild(ul);
    cont.appendChild(botao('Reconciliar pendências', () => agir(() => chamar('POST', '/api/demo/reconciliar'))));
  }

  function desenharPacientes() {
    const cont = $('pacientes'); cont.textContent = ''; cont.setAttribute('aria-busy', 'false');
    const ps = estado.dados.pacientes;
    if (!ps.length) { cont.appendChild(el('p', 'Nenhuma paciente cadastrada.', { class: 'vazio' })); return; }
    const t = el('table'); const cab = el('tr');
    for (const h of ['Paciente', 'Liberação', 'Situação', 'Ações']) cab.appendChild(el('th', h, { scope: 'col' }));
    t.appendChild(cab);
    for (const p of ps) {
      const tr = el('tr', null, p.atencao ? { class: 'atencao' } : {});
      tr.appendChild(el('td', `${p.nome} (${p.codigo})`));
      tr.appendChild(el('td', p.liberacao === 'ativa' ? `Ativa até ${p.validaAteTexto}` : ({ nenhuma: 'Não liberada', revogada: 'Revogada', expirada: 'Expirada' }[p.liberacao])));
      tr.appendChild(el('td', p.estadoTexto + (p.atencao ? ' — precisa de você' : '')));
      const td = el('td');
      const ativa = p.liberacao === 'ativa';
      td.appendChild(botao(ativa ? 'Renovar 30 dias' : 'Liberar 30 dias', () => agir(() => chamar('POST', '/api/profissional/liberar', { codigoPaciente: p.codigo, dias: 30 })), { 'aria-label': `${ativa ? 'Renovar' : 'Liberar'} ${p.nome} por 30 dias` }));
      if (ativa) td.appendChild(botao('Revogar', () => agir(() => chamar('POST', '/api/profissional/revogar', { codigoPaciente: p.codigo })), { 'aria-label': `Revogar liberação de ${p.nome}` }));
      if (ativa && p.estado !== 'atendimento_humano') td.appendChild(botao('Encaminhar/pausar', () => agir(() => chamar('POST', '/api/profissional/pausar', { codigoPaciente: p.codigo })), { 'aria-label': `Pausar a automação de ${p.nome}` }));
      if (ativa && p.estado === 'atendimento_humano') td.appendChild(botao('Retomar automação', () => agir(() => chamar('POST', '/api/profissional/retomar', { codigoPaciente: p.codigo })), { 'aria-label': `Retomar a automação de ${p.nome}` }));
      tr.appendChild(td); t.appendChild(tr);
    }
    cont.appendChild(t);
  }

  function desenharConsultas() {
    const cont = $('consultas'); cont.textContent = '';
    const cs = estado.dados.consultas;
    if (!cs.length) { cont.appendChild(el('p', 'Nenhuma consulta ainda. Libere uma paciente e agende pelo simulador.', { class: 'vazio' })); return; }
    const t = el('table'); const cab = el('tr');
    for (const h of ['Quando', 'Paciente', 'Situação', '']) cab.appendChild(el('th', h, { scope: 'col' }));
    t.appendChild(cab);
    for (const c of cs) {
      const tr = el('tr');
      tr.appendChild(el('td', c.inicioTexto)); tr.appendChild(el('td', c.pacienteNome || c.pacienteCodigo)); tr.appendChild(el('td', c.status === 'cancelada' ? `cancelada (${c.motivo === 'remarcada' ? 'remarcada' : 'sem nova data'})` : c.status));
      const td = el('td'); td.appendChild(botao('Abrir detalhes', () => abrirDetalhe(c.id), { 'aria-label': `Abrir detalhes da consulta ${c.id}` }));
      if (c.status === 'confirmada') td.appendChild(botao('Cancelar', () => agir(() => chamar('POST', '/api/profissional/cancelar-consulta', { consultaId: c.id })), { 'aria-label': `Cancelar a consulta ${c.id}` }));
      tr.appendChild(td); t.appendChild(tr);
    }
    cont.appendChild(t);
  }

  async function abrirDetalhe(id) {
    const cont = $('detalhe'); cont.textContent = 'Carregando detalhes…';
    try {
      const r = await chamar('GET', '/api/consultas/' + encodeURIComponent(id));
      cont.textContent = '';
      if (!r.ok) { cont.appendChild(el('p', r.mensagem, { class: 'aviso erro' })); return; }
      const c = r.consulta; const dl = el('dl');
      for (const [k, v] of [['Consulta', c.id], ['Paciente', `${c.pacienteNome || ''} (${c.pacienteCodigo})`], ['Quando', c.inicioTexto], ['Origem da agenda', c.origemAgenda], ['Situação', c.status + (c.motivo ? ` (${c.motivo})` : '')]]) { dl.appendChild(el('dt', k)); dl.appendChild(el('dd', v)); }
      cont.appendChild(el('h3', 'Detalhes da consulta')); cont.appendChild(dl); cont.focus();
    } catch (e) { cont.textContent = ''; cont.appendChild(el('p', 'Não foi possível abrir os detalhes.', { class: 'aviso erro' })); }
  }

  function desenharSeletor() {
    const sel = $('quem');
    if (sel.options.length !== estado.dados.pacientes.length) {
      sel.textContent = '';
      for (const p of estado.dados.pacientes) sel.appendChild(el('option', `${p.nome} (${p.codigo})`, { value: p.codigo }));
    }
    if (!estado.quem && estado.dados.pacientes.length) estado.quem = estado.dados.pacientes[0].codigo;
    sel.value = estado.quem || '';
  }

  function desenharConversa() {
    const cont = $('conversa'); cont.textContent = '';
    const cod = estado.quem; if (!cod) return;
    const msgs = estado.dados.mensagens.filter((m) => m.pacienteCodigo === cod);
    const locais = (estado.local[cod] = estado.local[cod] || []);
    if (!msgs.length && !locais.length) cont.appendChild(el('p', 'Sem mensagens. Envie MENU para começar (só funciona se a nutricionista liberou esta paciente).', { class: 'vazio' }));
    const ultimoComAcoes = [...msgs].reverse().find((m) => m.acoes && m.acoes.length && m.estado === 'enviada');
    const itens = [];
    msgs.forEach((m, i) => itens.push({ ordem: i, m }));
    for (const l of locais) itens.push({ ordem: l.apos - 0.5, l });
    itens.sort((a, b) => a.ordem - b.ordem);
    for (const it of itens) {
      if (it.l) { cont.appendChild(el('div', it.l.texto, { class: 'bolha eu' })); continue; }
      const m = it.m; const antiga = m !== ultimoComAcoes;
      const b = el('div', null, { class: 'bolha' + (antiga ? ' antiga' : '') });
      b.appendChild(el('span', m.texto));
      for (const a of m.acoes || []) b.appendChild(botao(a.rotulo, () => enviarAcao(a)));
      if (m.estado !== 'enviada') b.appendChild(el('span', m.estado === 'pendente' ? 'Não enviada (pendente)' : 'Bloqueada: sem liberação ou automação pausada', { class: 'estado' }));
      cont.appendChild(b);
    }
    cont.scrollTop = cont.scrollHeight;
  }

  function registrarLocal(texto) {
    const cod = estado.quem; const n = estado.dados.mensagens.filter((m) => m.pacienteCodigo === cod).length;
    (estado.local[cod] = estado.local[cod] || []).push({ texto, apos: n });
  }
  function enviarAcao(a) {
    registrarLocal(`[botão] ${a.rotulo}`);
    const parametros = {}; if (a.opcaoId !== undefined) parametros.opcaoId = a.opcaoId; if (a.versao !== undefined && a.comando !== 'ver_horarios' && a.comando !== 'parar' && a.comando !== 'falar_com_nutricionista') parametros.versao = a.versao;
    return agir(() => chamar('POST', '/api/paciente/evento', { codigoPaciente: estado.quem, comando: a.comando, parametros }));
  }

  function desenharRelogio() {
    const d = estado.dados;
    $('relogio').textContent = `Agora (relógio simulado): ${d.agoraTexto}` + (d.pendencias ? ` · ${d.pendencias} operação(ões) pendente(s)` : '') + (d.falhasArmadas.length ? ` · falha armada: ${d.falhasArmadas.join(', ')}` : '');
  }

  async function carregar() {
    try {
      estado.dados = await chamar('GET', '/api/estado');
      desenharRelogio(); desenharAtencao(); desenharPacientes(); desenharConsultas(); desenharPendentes(); desenharSeletor(); desenharConversa();
    } catch (e) {
      aviso('Não foi possível carregar a demonstração. Verifique se o servidor local está aberto e tente de novo.', 'erro');
      $('pacientes').setAttribute('aria-busy', 'false');
    }
  }

  $('quem').addEventListener('change', (e) => { estado.quem = e.target.value; desenharConversa(); });
  $('form-texto').addEventListener('submit', (e) => {
    e.preventDefault();
    const campo = $('texto'); const t = campo.value; if (!t.trim()) return;
    registrarLocal(t); campo.value = '';
    agir(() => chamar('POST', '/api/paciente/evento', { codigoPaciente: estado.quem, texto: t }));
  });
  document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
    const tipo = b.dataset.demo;
    if (tipo === 'reiniciar') { estado.local = {}; return agir(() => chamar('POST', '/api/demo/reiniciar')); }
    if (tipo === 'avancar') return agir(() => chamar('POST', '/api/demo/avancar', { horas: Number(b.dataset.horas) }));
    if (tipo === 'ocupar') return agir(() => chamar('POST', '/api/demo/ocupar', { codigoPaciente: estado.quem }));
    if (tipo === 'disputa') return agir(async () => { const r = await chamar('POST', '/api/demo/disputa'); return r.ok ? { ok: true, tipo: 'resposta', acao: 'disputa' } : r; });
    if (tipo === 'falha') return agir(() => chamar('POST', '/api/demo/falha', { ponto: b.dataset.ponto }));
    return agir(() => chamar('POST', '/api/demo/reconciliar'));
  }));

  carregar();
})();
