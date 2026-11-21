# Golden set do chat

Mede se o Pergunte responde certo sobre o handbook do laboratório: usa a ferramenta certa, cita a fonte, diz o que precisa e não inventa o que o handbook não tem.

## Casos

Cada arquivo agrupa os casos de uma categoria (`padroes`, `sistemas`, `glossario`, `decisoes`, `onboarding`, `sem-resposta`, `fora-do-escopo`). Cada caso tem:

- `id` e `question`: identificador em kebab-case e a pergunta como a pessoa faria.
- `expect.tools`: ferramentas aceitas; pelo menos uma precisa ser chamada.
- `expect.sources`: fontes que a resposta precisa citar (ID do padrão, nome do sistema, termo do glossário ou seção). Uma lista dentro da lista aceita qualquer uma das alternativas.
- `expect.include`: frases que precisam aparecer, sem diferença de acento ou caixa. Lista dentro da lista também vale como alternativas.
- `expect.exclude`: frases que não podem aparecer, como uma regra inventada.
- `expect.hiddenFromModel`: dados pessoais da pergunta que não podem chegar ao modelo nem voltar na resposta.
- `offline`: roteiro do provedor falso, com as chamadas de ferramenta e a resposta que um modelo correto daria.

A resposta também precisa ter vindo do modelo: cair no modo busca conta como erro.

## Rodar

```bash
npm run chat-evals -- --offline
PORTAL_LLM_BASE_URL=... PORTAL_LLM_API_KEY=... PORTAL_LLM_MODEL=... npm run chat-evals -- --min 0.8
```

Opções: `--only <id,id>` roda só alguns casos, `--json <arquivo>` e `--summary <arquivo>` gravam o relatório, `--cases <pasta>` e `--handbook <pasta>` trocam as pastas. O comando sai com erro se a taxa de acerto ficar abaixo de `--min`.

O modo offline roda no `npm run verify` (teste `apps/portal-api/test/chat-evals.test.ts`) e precisa passar inteiro: as ferramentas rodam sobre o handbook de verdade, então um caso quebra se o padrão, o sistema ou o termo citado sumir do handbook. O workflow `chat-evals` roda com o modelo real só quando o secret `GEMINI_API_KEY` e a variável `GEMINI_MODEL` existem, pelo endpoint compatível com OpenAI do gateway, e publica o relatório no resumo do job sem bloquear o PR.

Mudança em `apps/portal-api/prompts/` recebe o rótulo `risk:ai-behavior` e só entra se o acerto no golden set não cair.
