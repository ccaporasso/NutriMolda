// T23 (ESQUELETO): biblioteca de frases e links wa.me com o texto pronto.
// O kit só MONTA o link. Quem clica e aperta "enviar" no WhatsApp é a nutricionista: nada é enviado sozinho
// (D3: sem automação não oficial). Frases neutras, sem dado de saúde (D11), escritas por ela, nunca por IA (D5).
// Pendências: PENDENTE Pn (docs/PENDENCIAS-FASE-2B.md).

// Único campo que uma frase pode preencher: o primeiro nome. Nada de saúde, valor ou data de consulta.
const CAMPOS_PERMITIDOS_FRASE = ['primeiro_nome'];
const MAX_FRASE = 300;

// PENDENTE P7: os textos finais são dela. Estas frases são só um esqueleto para os testes.
const FRASES_MODELO = [
  { id: 'F01', texto: 'Oi, {primeiro_nome}! Passando para saber como foi a sua semana.' },
  { id: 'F02', texto: 'Oi, {primeiro_nome}! Se quiser conversar, é só me responder por aqui.' },
];

// Devolve { ok: true } ou { ok: false, motivo }.
function validarFrase(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') return { ok: false, motivo: 'A frase está vazia.' };
  if (Array.from(texto).length > MAX_FRASE) return { ok: false, motivo: `A frase passa de ${MAX_FRASE} caracteres.` };
  for (const m of texto.matchAll(/\{([^{}]*)\}/g)) {
    if (!CAMPOS_PERMITIDOS_FRASE.includes(m[1])) return { ok: false, motivo: `O campo {${m[1]}} não é permitido. Só ${CAMPOS_PERMITIDOS_FRASE.map((c) => `{${c}}`).join(', ')}.` };
  }
  if (/[{}]/.test(texto.replace(/\{[^{}]*\}/g, ''))) return { ok: false, motivo: 'Chave { } solta na frase.' };
  if (/https?:\/\/|www\./i.test(texto)) return { ok: false, motivo: 'A frase não pode ter link.' };
  if (/\d{5,}/.test(texto.replace(/\s/g, ''))) return { ok: false, motivo: 'A frase não pode ter número longo (telefone, CPF, valor).' };
  return { ok: true };
}

// Troca {primeiro_nome}. Frase inválida ou paciente sem primeiro nome: erro claro, nunca "{primeiro_nome}" cru.
function preencherFrase(texto, paciente) {
  const v = validarFrase(texto);
  if (!v.ok) throw new Error(v.motivo);
  const nome = String((paciente && paciente.primeiro_nome) || '').trim();
  if (texto.includes('{primeiro_nome}') && nome === '') throw new Error('O paciente não tem primeiro nome cadastrado.');
  return texto.replace(/\{primeiro_nome\}/g, nome);
}

// Telefone brasileiro (DDD + 8 ou 9 dígitos, com ou sem 55) -> "55DDDNNNNNNNNN". Erro claro se não der.
function telefoneParaWhatsapp(telefone) {
  let d = String(telefone === undefined || telefone === null ? '' : telefone).replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) throw new Error('Telefone inválido: use DDD e número (por exemplo, 11 90000-0000).');
  return `55${d}`;
}

// Link de conversa com o texto pronto (clique dela). Sem envio automático.
function montarLinkWhatsapp(telefone, texto) {
  const v = validarFrase(texto);
  if (!v.ok) throw new Error(v.motivo);
  return `https://wa.me/${telefoneParaWhatsapp(telefone)}?text=${encodeURIComponent(texto)}`;
}

// Atalho: frase da biblioteca + paciente -> link. Recusa paciente sem telefone ou sem autorização de mensagens.
function linkDaFrase(idFrase, paciente, frases = FRASES_MODELO) {
  const frase = frases.find((f) => f.id === idFrase);
  if (!frase) throw new Error('Frase não encontrada na biblioteca.');
  if (!paciente || !paciente.autorizou_mensagens_em) throw new Error('O paciente ainda não autorizou receber mensagens.');
  return montarLinkWhatsapp(paciente.telefone, preencherFrase(frase.texto, paciente));
}

if (typeof module !== 'undefined') {
  module.exports = {
    CAMPOS_PERMITIDOS_FRASE, MAX_FRASE, FRASES_MODELO, validarFrase, preencherFrase, telefoneParaWhatsapp, montarLinkWhatsapp, linkDaFrase,
  };
}
