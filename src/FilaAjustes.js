// T22 (ESQUELETO): fila de ajustes do plano, com aprovação dela em um ou dois toques (D8).
// Nada chega ao paciente sem ela aprovar. Sem IA (D5): a única sugestão é o trecho EXATO da tabela de
// substituições que ela aprovou (D7); o que não está na tabela vai para ela decidir, sem resposta inventada.
// Só lógica pura, só código de paciente. Pendências: PENDENTE Pn (docs/PENDENCIAS-FASE-2B.md).

const ESTADOS_AJUSTE = ['pendente', 'aprovado', 'recusado'];
// PENDENTE P5: os tipos de pedido que o paciente pode fazer e o que cada um traz. Estes são só um esqueleto.
const TIPOS_AJUSTE = ['troca_alimento', 'outro'];

function normalizarAjuste_(texto) {
  return String(texto === undefined || texto === null ? '' : texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// tabela: [{ alimento, troca }] aprovada por ela (PENDENTE P6: a tabela real é dela; o formato pode mudar).
// Só acha igualdade (sem acento e sem diferença de maiúscula). Nunca "parecido": na dúvida, devolve null.
function buscarNaTabela(tabela, termo) {
  const t = normalizarAjuste_(termo);
  if (t === '') return null;
  const achados = tabela.filter((l) => normalizarAjuste_(l.alimento) === t);
  return achados.length === 1 ? { alimento: achados[0].alimento, trecho: achados[0].troca } : null;
}

// Entra na fila como pendente. `sugestao` é o trecho da tabela, ou null (vai só para ela).
function criarPedidoAjuste({ id, codigoPaciente, tipo, termo, criadoEm }, tabela) {
  if (!/^AJ\d{4,}$/.test(String(id))) throw new Error('Identificador do pedido inválido (esperado algo como AJ0001).');
  if (!/^P\d{4}$/.test(String(codigoPaciente))) throw new Error('Código de paciente inválido.');
  if (!TIPOS_AJUSTE.includes(tipo)) throw new Error(`Tipo de pedido inválido (esperado: ${TIPOS_AJUSTE.join(', ')}).`);
  return {
    id, codigo_paciente: codigoPaciente, tipo, termo: String(termo || '').trim().slice(0, 80), criado_em: criadoEm,
    estado: 'pendente', sugestao: tipo === 'troca_alimento' ? buscarNaTabela(tabela, termo) : null,
    texto_final: '', decidido_em: '',
  };
}

// Um toque: aprova a sugestão da tabela como está. Dois toques: ela edita o texto e aprova.
// Sem sugestão e sem texto dela, não aprova: nada vai ao paciente por conta do kit.
function aprovarAjuste(pedido, { textoEditado, agoraTexto }) {
  if (pedido.estado !== 'pendente') return { ok: false, motivo: `O pedido ${pedido.id} já foi decidido (${pedido.estado}).` };
  const editado = typeof textoEditado === 'string' && textoEditado.trim() !== '';
  const texto = editado ? textoEditado.trim() : (pedido.sugestao ? pedido.sugestao.trecho : '');
  if (texto === '') return { ok: false, motivo: `O pedido ${pedido.id} não tem trecho na tabela. Escreva o texto para aprovar.` };
  return { ok: true, pedido: { ...pedido, estado: 'aprovado', texto_final: texto, decidido_em: agoraTexto, toques: editado ? 2 : 1 } };
}

function recusarAjuste(pedido, { agoraTexto }) {
  if (pedido.estado !== 'pendente') return { ok: false, motivo: `O pedido ${pedido.id} já foi decidido (${pedido.estado}).` };
  return { ok: true, pedido: { ...pedido, estado: 'recusado', decidido_em: agoraTexto } };
}

// Única porta de saída para o paciente: só o que ela aprovou e só o texto aprovado.
function textoParaEnviarAoPaciente(pedido) {
  return pedido.estado === 'aprovado' && pedido.texto_final !== '' ? pedido.texto_final : null;
}

// Pendentes primeiro, do mais antigo para o mais novo.
function ordenarFila(pedidos) {
  return pedidos.slice().sort((a, b) => (a.estado === 'pendente' ? 0 : 1) - (b.estado === 'pendente' ? 0 : 1)
    || String(a.criado_em).localeCompare(String(b.criado_em)));
}

if (typeof module !== 'undefined') {
  module.exports = {
    ESTADOS_AJUSTE, TIPOS_AJUSTE, buscarNaTabela, criarPedidoAjuste, aprovarAjuste, recusarAjuste, textoParaEnviarAoPaciente, ordenarFila,
  };
}
