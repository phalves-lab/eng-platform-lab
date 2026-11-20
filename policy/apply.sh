#!/usr/bin/env bash
set -euo pipefail

REPO="${1:?Uso: policy/apply.sh <owner/repo>}"
DIR="$(cd "$(dirname "$0")" && pwd)"

gh api --method PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false >/dev/null
echo "Actions: token padrão somente leitura e sem permissão de aprovar PR."

for file in "$DIR"/rulesets/*.json; do
  name="$(jq -r .name "$file")"
  id="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id")"
  if [ -n "$id" ]; then
    gh api --method PUT "repos/$REPO/rulesets/$id" --input "$file" >/dev/null
    echo "Ruleset \"$name\" atualizado ($id)."
  else
    gh api --method POST "repos/$REPO/rulesets" --input "$file" >/dev/null
    echo "Ruleset \"$name\" criado."
  fi
done
