---
name: taskforge
description: Executa uma task do quadro ponta a ponta no repositório atual, da leitura dos critérios de aceite ao PR aberto no template. Use quando alguém passar a chave de uma task ou pedir para pegar uma task.
---

# Taskforge

1. Leia a task e liste os critérios de aceite antes de tocar no código.
2. Crie a branch `tipo/CHAVE-123-slug` a partir da base atualizada.
3. Implemente seguindo o `AGENTS.md` do repositório, com teste para cada regra nova.
4. Rode o gate local e abra o PR no template, com a chave da task.
