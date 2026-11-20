# Golden set do bot de review

Mede se o bot encontra defeitos conhecidos e se fica quieto quando não há defeito.

## Casos

Cada arquivo em `cases/` é um PR sintético:

- `task`: task completa (título, descrição, critérios de aceite).
- `patch`: diff real do código do laboratório com o defeito introduzido.
- `expect.findings`: arquivos onde o bot precisa apontar achado com severidade mínima (e camada, se informada).
- `expect.acceptance`: critérios que precisam sair como `nao_encontrado` ou `parcial`.
- `expect.signal`: sinal aceito (`ajustes`, `gate`, `pronto`).
- `expect.noSevereFindings`: caso limpo; qualquer achado crítico ou alto conta como falso positivo.

Casos atuais:

- Defeitos que o bot precisa achar: autoaprovação removida, aprovador contado duas vezes, antecedência fora por um, migração destrutiva, cancelamento de campanha aprovada, filtro do jscpd que nunca casa (defeito real do PR #7).
- Falsos positivos que o bot não pode marcar como grave: refatoração sem efeito e três apontamentos errados do PR #7 (revisão de dependências sem checkout, RN-22 na higiene local, chave `issues` do knip).

Casos podem trazer `fileContents` (conteúdo final dos arquivos) e `checks` (resultado do CI), que a verificação adversarial usa como evidência. Achado incerto conta como encontrado, mas não como falso positivo grave.

## Rodar

```bash
npm run review -- eval --config-dir "$PWD" --dry-run
GEMINI_API_KEY=... GEMINI_MODEL=... npm run review -- eval --config-dir "$PWD" --min 0.8
```

O comando sai com erro se a taxa de acerto ficar abaixo de `--min`. Mudança em `review/` ou em `tools/review-bot/src/` só entra se a taxa não cair.

## Casos com dado real

Casos derivados de defeitos reais de empresa ficam fora deste repositório, com `confidential: true`. O runner aceita `--cases-dir` apontando para eles, mas só em `--dry-run`: dado confidencial nunca vai para o LLM do laboratório, que usa chave pessoal. A mesma regra vale para `review --source atlassian`.
