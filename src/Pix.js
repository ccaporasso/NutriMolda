// Pix copia e cola (lógica pura, sem chamadas ao Google).
// Fonte: docs/ESPECIFICACAO.md, seção "Pix copia e cola" (padrão EMV do Banco Central).
// As mensagens de erro citam só o NOME do campo, nunca o valor (chave Pix é dado pessoal).

const LIMITE_NOME_PIX = 25;
const LIMITE_CIDADE_PIX = 15;
const LIMITE_ID_TRANSACAO = 25;
const LIMITE_CHAVE_PIX = 77; // 99 do campo 26 menos "br.gov.bcb.pix" e os cabeçalhos
const LIMITE_VALOR_PIX = 13; // o campo 54 (valor) do padrão tem no máximo 13 caracteres: dez algarismos de reais cabem, onze não

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

function cpfValidoPix_(texto) {
  return typeof cpfValido !== 'undefined' ? cpfValido(texto) : require('./Formatos.js').cpfValido(texto);
}

// Formato da chave (B5): e-mail, CPF ou CNPJ só com números, telefone com +55 ou chave aleatória. Nada é "consertado"
// (D18): chave fora do formato é recusada com a explicação. Devolve '' se está certa. A mensagem nunca repete a chave.
function problemaNaChavePix(chave) {
  const c = String(chave).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return '';
  if (/^\+55\d{10,11}$/.test(c) || /^\d{14}$/.test(c)) return '';
  if (/^\d{11}$/.test(c)) {
    return cpfValidoPix_(c) ? '' : 'A chave Pix tem 11 números, mas não é um CPF válido. Se for telefone, escreva +55, o DDD e o número (por exemplo +5511900000000). Confira "chave_pix" na aba Configurações.';
  }
  if (/^[\d\s().+\/-]+$/.test(c)) {
    return 'A chave Pix tem pontos, traços, espaços ou parênteses. CPF ou CNPJ: só os números. Telefone: +55, DDD e número, sem espaços. Confira "chave_pix" na aba Configurações.';
  }
  return 'A chave Pix não parece e-mail, CPF, CNPJ, telefone (+55...) nem chave aleatória. Confira "chave_pix" na aba Configurações.';
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
  const problemaChave = problemaNaChavePix(chaveLimpa);
  if (problemaChave) throw new Error(problemaChave);
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
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
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
  const valorTexto = reais + '.' + centavos;
  if (valorTexto.length > LIMITE_VALOR_PIX) throw new Error('O valor do Pix é alto demais para o padrão (limite de R$ 9.999.999.999,99). Confira o valor.');

  const semCrc =
    montarCampo('00', '01') +
    montarCampo('26', montarCampo('00', 'br.gov.bcb.pix') + montarCampo('01', chaveLimpa)) +
    montarCampo('52', '0000') +
    montarCampo('53', '986') +
    montarCampo('54', valorTexto) +
    montarCampo('58', 'BR') +
    montarCampo('59', nomeNorm) +
    montarCampo('60', cidadeNorm) +
    montarCampo('62', montarCampo('05', idTx)) +
    '6304';
  return semCrc + calcularCrc16(semCrc);
}

if (typeof module !== 'undefined') {
  module.exports = { calcularCrc16, montarCampo, normalizarTextoPix, problemaNaChavePix, gerarPixCopiaECola };
}
