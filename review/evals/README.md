# Golden set do bot de review

Cada caso em `cases/` descreve um PR sintético com defeito conhecido e o que o bot precisa encontrar.

Formato de cada caso:

- `task`: chave da task em `fixtures/jira`
- `patch`: diff aplicado sobre `main`
- `expect.findings`: títulos ou arquivos que precisam aparecer com severidade mínima
- `expect.acceptance`: critérios que precisam ser marcados como `nao_encontrado` ou `parcial`

Regra: mudança em `review/` ou em `tools/review-bot/src/` só entra se a taxa de acerto no golden set não cair. O runner automático é a próxima etapa do laboratório.
