// Pix copia e cola (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, seção "Pix copia e cola" (padrão EMV do Banco Central).
// As mensagens de erro citam só o NOME do campo, nunca o valor (chave Pix é dado pessoal).

const LIMITE_NOME_PIX = 25;
const LIMITE_CIDADE_PIX = 15;
const LIMITE_ID_TRANSACAO = 25;
const LIMITE_CHAVE_PIX = 77; // 99 do campo 26 menos "br.gov.bcb.pix" e os cabeçalhos

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF). Devolve 4 letras hexadecimais maiúsculas.
function calcularCrc16(texto) {
  let crc = 0xFFFF;
  for (let i = 0; i < texto.length; i++) {
    crc ^= (texto.charCodeAt(i) & 0xFF) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Um campo do padrão: id (2 dígitos) + tamanho (2 dígitos) + valor.
function montarCampo(id, valor) {
  const tamanho = String(valor.length);
  if (valor.length > 99) throw new Error('Campo do Pix grande demais.');
  return id + tamanho.padStart(2, '0') + valor;
}

// Maiúsculas, sem acento e só caracteres ASCII, como o padrão exige.
function normalizarTextoPix(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '').toUpperCase().trim();
}

// Devolve o texto do Pix copia e cola. Valor em centavos (inteiro maior que zero).
function gerarPixCopiaECola({ chave, nome, cidade, valorCentavos, idTransacao }) {
  if (typeof chave !== 'string' || chave.trim() === '') {
    throw new Error('Falta a chave Pix. Preencha "chave_pix" na aba Configurações.');
  }
  const chaveLimpa = chave.trim();
  if (chaveLimpa.length > LIMITE_CHAVE_PIX || /[^\x20-\x7E]/.test(chaveLimpa)) {
    throw new Error('A chave Pix está inválida. Confira "chave_pix" na aba Configurações.');
  }
  const nomeNorm = typeof nome === 'string' ? normalizarTextoPix(nome) : '';
  if (nomeNorm === '') throw new Error('Falta o nome do recebedor. Preencha "nome_recebedor_pix" na aba Configurações.');
  if (nomeNorm.length > LIMITE_NOME_PIX) {
    throw new Error('"nome_recebedor_pix" passa de ' + LIMITE_NOME_PIX + ' caracteres. Encurte na aba Configurações.');
  }
  const cidadeNorm = typeof cidade === 'string' ? normalizarTextoPix(cidade) : '';
  if (cidadeNorm === '') throw new Error('Falta a cidade do recebedor. Preencha "cidade_recebedor_pix" na aba Configurações.');
  if (cidadeNorm.length > LIMITE_CIDADE_PIX) {
    throw new Error('"cidade_recebedor_pix" passa de ' + LIMITE_CIDADE_PIX + ' caracteres. Encurte na aba Configurações.');
  }
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error('O valor do Pix precisa ser maior que zero, em centavos inteiros.');
  }
  let idTx = '***'; // padrão para "sem identificador"
  if (idTransacao !== undefined && idTransacao !== null && idTransacao !== '') {
    if (typeof idTransacao !== 'string' || !/^[A-Za-z0-9]{1,25}$/.test(idTransacao)) {
      throw new Error('O identificador da transação precisa ter de 1 a ' + LIMITE_ID_TRANSACAO + ' letras ou números, sem espaços.');
    }
    idTx = idTransacao;
  }
  const reais = Math.floor(valorCentavos / 100);
  const centavos = String(valorCentavos % 100).padStart(2, '0');

  const semCrc =
    montarCampo('00', '01') +
    montarCampo('26', montarCampo('00', 'br.gov.bcb.pix') + montarCampo('01', chaveLimpa)) +
    montarCampo('52', '0000') +
    montarCampo('53', '986') +
    montarCampo('54', reais + '.' + centavos) +
    montarCampo('58', 'BR') +
    montarCampo('59', nomeNorm) +
    montarCampo('60', cidadeNorm) +
    montarCampo('62', montarCampo('05', idTx)) +
    '6304';
  return semCrc + calcularCrc16(semCrc);
}

if (typeof module !== 'undefined') {
  module.exports = { calcularCrc16, montarCampo, normalizarTextoPix, gerarPixCopiaECola };
}
