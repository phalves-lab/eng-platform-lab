---
name: pre-pr
description: Roda localmente os mesmos gates do CI (lint, formatação, tipos, testes, cobertura das linhas novas, build, higiene do PR, Semgrep), o relatório de qualidade e o review do bot, e corrige o que vai barrar o PR antes de abrir. Use quando o dev disser "pre-pr", "pronto para PR", "vou abrir o PR", "checa antes do PR" ou pedir para validar a branch.
---

# pre-pr

Objetivo: o dev abre o PR sabendo que o CI não vai barrar e já sabendo o que o bot vai apontar.

## Passos

1. Atualize a base: `git fetch origin`.
2. Confirme que a branch segue `tipo/CHAVE-123-slug` e que há commits sobre `origin/develop`.
3. Se o corpo do PR já existir, salve em um arquivo temporário e passe `--body-file`. Sem ele, a checagem do corpo fica para o CI.
4. Rode `npm run pre-pr -- --base origin/develop [--body-file <arquivo>]`.
5. Para cada etapa marcada como "bloqueia no CI" que falhou:
   - Lint, formatação ou tipos: corrija o código. Formatação se resolve com `npx prettier --write` nos arquivos alterados.
   - Testes: entenda a falha antes de mudar teste. Teste só muda se a regra mudou de propósito.
   - Cobertura das linhas novas: escreva o teste que falta para o comportamento novo. Não teste por número.
   - Higiene: ajuste título, branch ou corpo conforme a regra citada (RN-06, RN-08, RN-11, RN-22, RN-27).
6. Rode de novo até o resumo dizer que nenhuma etapa local vai barrar o PR.
7. Leia o relatório de qualidade e o review do bot, se a chave estiver no ambiente. Trate o que for de baixo custo; o resto vira observação no PR.
8. Monte o corpo do PR com `.github/PULL_REQUEST_TEMPLATE.md`: linha **Task**, Contexto de negócio em linguagem de produto, O que mudou, Como testar com a evidência, SQL e ENV quando o diff exigir, Uso de IA.

## Não fazer

- Não usar `--no-verify`, desligar teste ou baixar cobertura para passar.
- Não abrir o PR com etapa bloqueante falhando.
- Não colocar dado real de empresa no corpo do PR deste repositório: ele é público.
