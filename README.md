# eng-platform-lab

Laboratório público de uma esteira de desenvolvimento com IA: gates determinísticos, segurança, review de IA com contexto de negócio e merge queue, rodando sobre um app sintético.

Tudo aqui é sintético. O repositório é público de propósito: no GitHub free, só repositório público de organização tem rulesets, checks obrigatórios e merge queue.

## O que a esteira faz em cada PR

| Etapa                                                                                             | Workflow              | Bloqueia merge? |
| ------------------------------------------------------------------------------------------------- | --------------------- | --------------- |
| Lint, format, typecheck, testes (com Postgres real), diff coverage de 70%, build                  | `ci / verify / gates` | Sim             |
| Segredos (TruffleHog), dependências (`npm audit`), SAST (Semgrep com regras próprias)             | `ci / security / *`   | Sim             |
| Título, nome de branch com chave da task e seções do template                                     | `ci / hygiene`        | Sim             |
| Rótulos de risco por caminho (`risk:db-migration`, `risk:auth`, `risk:infra`, `risk:ai-behavior`) | `labels`              | Não, informa    |
| Review com contexto (task, critérios de aceite, módulo, documentação, diff)                       | `ci / ai-review`      | Não, comenta    |
| Reexecução dos gates sobre a base atualizada                                                      | merge queue           | Sim             |

O bot roda o código e os prompts da **branch base**, não os do PR, e só tem permissão de comentar. Ele não aprova, não pede mudanças e não mergeia.

## Rodar localmente

```bash
npm ci
npm run verify
```

Ver o prompt que o bot montaria para a sua branch, sem chamar modelo:

```bash
npm run review -- review --repo-dir "$PWD" --config-dir "$PWD" --base origin/main --dry-run
```

Rodar o review de verdade, com Gemini:

```bash
GEMINI_API_KEY=... GEMINI_MODEL=... npm run review -- review --repo-dir "$PWD" --config-dir "$PWD" --base origin/main
```

## Jira e Confluence reais (somente leitura, só local)

Com as variáveis `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL` e `ATLASSIAN_API_TOKEN` no ambiente (de preferência carregadas de um cofre):

```bash
npm run review -- task ABC-1234
npm run review -- review --repo-dir "$PWD" --config-dir "$PWD" --base origin/main --task ABC-1234 --source atlassian --dry-run
```

O cliente do Atlassian recusa qualquer método diferente de GET antes de chegar à rede, e a fonte `atlassian` se recusa a rodar com `CI=true`.

## Escrita no Jira e no Confluence (preparada, só com confirmação)

```bash
npm run review -- propose jira-comment ABC-1234 --body-file comentario.md
npm run review -- propose confluence-update 123456 --title "Módulo X" --body-file pagina.html --confirm
```

Sem `--confirm` é simulação. Com `--confirm`, só executa em terminal interativo, fora de CI e depois de você digitar o alvo exato.

## Configuração do repositório

- Secret `GEMINI_API_KEY` e variável `GEMINI_MODEL` (versão fixada do modelo) em Settings > Secrets and variables > Actions.
- `policy/apply.sh phalves-lab/eng-platform-lab` aplica o ruleset de `policy/rulesets/` e deixa o token das Actions somente leitura, sem permissão de aprovar PR.

## Limites conhecidos

- **Modo solo:** o ruleset exige 0 aprovações porque o autor não pode aprovar o próprio PR. Com uma segunda conta revisora, subir para 1 ou 2.
- **Bot com mudança em si mesmo:** como o bot roda da base, um PR que altera o bot só muda o comportamento depois do merge.
- **Golden set:** os casos estão em `review/evals/`; o runner automático é a próxima etapa.
