#!/bin/bash
# Execute na raiz do snapshot/repositório. Só dados fictícios, sem Git/Google.
set -u
review_root=${NUTRIMOLDA_REVIEW_ROOT:-$PWD}
cd "$review_root" || exit 1
test -f scripts/revisao.js || exit 1
review_tmp=$(mktemp -d)
trap 'rm -rf "$review_tmp"' EXIT
export REVISAO_PASTA_RESPOSTAS="$review_tmp/respostas"
cat > "$review_tmp/aprovada.md" <<'EOF'
# Revisão T05

## Parecer
APROVADO COM RESSALVAS

## Resumo
Resumo fictício.

## Problemas
### P1 [MÉDIA] src/Agenda.js, exemplo
- Trecho: `ficticio`
- Problema: falha fictícia.
- Correção esperada: corrigir.

## Testes
Teste local.

## Pontos para validar no Google
Nenhum.
EOF
sed -e 's/APROVADO COM RESSALVAS/REPROVADO/' -e 's/\[MÉDIA\]/[ALTA]/' "$review_tmp/aprovada.md" > "$review_tmp/reprovada.md"
printf 'Ficou ótimo!\n' > "$review_tmp/invalida.md"
check() {
  expected=$1
  shift
  node scripts/revisao.js "$@" > "$review_tmp/saida.txt" 2>&1
  result=$?
  printf '%s: esperado=%s obtido=%s\n' "$*" "$expected" "$result"
  if [ "$result" -ne "$expected" ]; then cat "$review_tmp/saida.txt"; exit 1; fi
}
check 0 salvar T05 < "$review_tmp/aprovada.md"
check 0 conferir T05
check 3 salvar T06 < "$review_tmp/reprovada.md"
check 3 conferir T06
check 1 salvar T07 < "$review_tmp/invalida.md"
check 1 conferir T07
check 1 conferir T08
