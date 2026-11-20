# Política de uso de IA

Versão do laboratório. Serve de base para a política real do time.

## Responsabilidade

- O autor responde por todo o conteúdo do PR, gerado por IA ou não, e precisa conseguir explicar qualquer linha.
- A IA não aprova, não pede mudanças e não mergeia. O bot só comenta.
- Ferramenta não é autor: não usar `Co-authored-by` para IA. O uso de IA é declarado na seção "Uso de IA" do PR.

## Dados

- Código e dados de cliente, aluno ou lead não entram em ferramenta de IA sem contrato de retenção zero.
- Neste laboratório só existe código e dado sintético. Leitura de Jira e Confluence reais acontece apenas na máquina do operador, nunca no CI.
- Segredo nunca vai para prompt, log ou código.

## Escrita em sistemas externos

- Escrita no Jira e no Confluence fica preparada, mas só executa com `--confirm`, em terminal interativo, fora de CI e com o operador digitando o alvo.

## Modelos e prompts

- Modelo sempre com versão fixada (`GEMINI_MODEL`).
- Mudança de prompt ou rubrica do bot recebe o rótulo `risk:ai-behavior` e passa pelo golden set em `review/evals/` antes do merge.
