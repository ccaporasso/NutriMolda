// Chamadas ao Drive pelo Serviço Avançado "Drive" (API v3), no lugar do DriveApp.
// Motivo (D20, revisão R08/N8-01): a documentação do DriveApp lista o escopo `drive` (acesso a todo o Drive) para
// copiar arquivo e criar pasta. A API v3 aceita `drive.file`, que só enxerga o que o próprio kit criou.
// Todas as chamadas do kit ao Drive passam por aqui: nenhum outro arquivo usa DriveApp.
// Ainda precisa ser validado no Google (docs/VALIDACAO-NO-GOOGLE.md).

const MIME_PASTA_DRIVE = 'application/vnd.google-apps.folder';
const MIME_DOCUMENTO_DRIVE = 'application/vnd.google-apps.document';

// Cria o modelo pelo mesmo app da API Drive que depois o copia com drive.file.
// DocumentApp fica responsável por preencher o Docs, não por criar o arquivo.
function driveCriarDocumento(nome) {
  return Drive.Files.create({ name: nome, mimeType: MIME_DOCUMENTO_DRIVE }, null, { fields: 'id' }).id;
}

// Id de arquivo ou pasta do Drive: só letras, números, hífen e sublinhado. Vira parte de uma consulta (q), então
// qualquer outro caractere (aspas, por exemplo) é recusado em vez de escapado.
function validarIdDrive_(id, nomeCampo) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{5,100}$/.test(id)) {
    throw erroDeUso_(`"${nomeCampo}" não parece um identificador do Drive. Rode Configuração > Criar modelo e pasta de recibos com o campo em branco.`);
  }
  return id;
}

function linkDoArquivoDrive_(arquivo) {
  return arquivo.webViewLink || `https://drive.google.com/file/d/${arquivo.id}/view`;
}

// Copia um arquivo (o modelo do recibo) para a pasta. Devolve o id da cópia.
function driveCopiar(idOrigem, nome, idPasta) {
  return Drive.Files.copy({ name: nome, parents: [idPasta] }, idOrigem, { fields: 'id' }).id;
}

// Cria um arquivo na pasta a partir de um blob. `propriedades` (opcional) ficam gravadas no arquivo (identidade). Devolve { id, url }.
function driveCriarArquivo(idPasta, nome, tipo, blob, propriedades) {
  const recurso = { name: nome, mimeType: tipo, parents: [idPasta] };
  if (propriedades) recurso.appProperties = propriedades;
  const criado = Drive.Files.create(recurso, blob, { fields: 'id,webViewLink' });
  return { id: criado.id, url: linkDoArquivoDrive_(criado) };
}

// Procura, só dentro da pasta e fora da lixeira, um arquivo pelo nome exato. Devolve o id ou null.
function driveAcharNaPasta(idPasta, nome) {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(nome)) throw new Error('Nome de arquivo inválido para busca.');
  const resposta = Drive.Files.list({ q: `name = '${nome}' and '${idPasta}' in parents and trashed = false`, fields: 'files(id)', pageSize: 1 });
  const achados = (resposta && resposta.files) || [];
  return achados.length > 0 ? achados[0].id : null;
}

// Candidatos a PDF do recibo de um pagamento: na pasta, fora da lixeira, com a identidade gravada OU com o nome do recibo.
// Quem decide o que serve é escolherReciboExistente (Recibo.js). Devolve [{ id, name, appProperties, url }] (até 10).
function driveListarRecibosDoPagamento(idPasta, idPagamento, nomeArquivo) {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(String(idPagamento)) || !/^[A-Za-z0-9._-]{1,150}$/.test(nomeArquivo)) {
    throw erroDeUso_('O id do pagamento tem caracteres que o kit não aceita. Nada foi gerado.');
  }
  const q = `'${idPasta}' in parents and trashed = false and (appProperties has { key='${PROPRIEDADE_RECIBO_PAGAMENTO}' and value='${idPagamento}' } or name = '${nomeArquivo}')`;
  const resposta = Drive.Files.list({ q, fields: 'files(id,name,appProperties,webViewLink)', pageSize: 10 });
  return ((resposta && resposta.files) || []).map((a) => ({ id: a.id, name: a.name, appProperties: a.appProperties || {}, url: linkDoArquivoDrive_(a) }));
}

function driveSubstituirConteudo(idArquivo, blob) {
  Drive.Files.update({}, idArquivo, blob, { fields: 'id' });
}

function driveMandarParaLixeira(idArquivo) {
  Drive.Files.update({ trashed: true }, idArquivo, null, { fields: 'id' });
}

function driveCriarPasta(nome) {
  return Drive.Files.create({ name: nome, mimeType: MIME_PASTA_DRIVE }, null, { fields: 'id' }).id;
}
