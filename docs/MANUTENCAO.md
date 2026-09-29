# Manutenção

## Ambientes

- **Teste:** conta Google só com dados inventados. Toda mudança passa por aqui primeiro.
- **Cliente:** a conta da nutricionista. Só recebe versões testadas.

## Como uma mudança acontece

1. Você descreve o que quer ao Claude Code.
2. Ele propõe o plano, você aprova, ele programa e roda os testes.
3. Ele envia para o projeto de TESTE, e você testa pelo roteiro que ele entregar.
4. Deu certo: commit no Git, anotação no `CHANGELOG.md`, e só então a versão vai para a cliente.
5. Deu errado depois: volte para a versão anterior pelo Git e pelo histórico de versões do Apps Script.

## No dia a dia

- O aviso de falha chega por e-mail. Toda semana, olhe a aba Registro.
- Guarde uma cópia da planilha de cada cliente com dados apagados como modelo.
- Uma vez por ano, e antes de qualquer grande mudança, peça uma revisão a uma pessoa desenvolvedora.

## Limites do Claude

Ele não guarda memória entre conversas, não monitora nada em produção e pode errar, inclusive em segurança. Tudo o que importa fica escrito neste repositório.
