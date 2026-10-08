# Plano de teste: {{nome do seu app}}

Commit: {{commit}}  Data: {{AAAA-MM-DD}}  Onde: servidor local, dados de mentira

Tipo: feliz (o caminho normal), borda (situação esquisita), erro (algo dá errado de propósito).
Como: auto (teste automático em `app/codigo/e2e/`) ou mão (passada à mão).

| caso | caminho | tipo | passos | o que tem que acontecer | como | resultado |
| --- | --- | --- | --- | --- | --- | --- |
| C01-F1 | C01 cliente marca horário no salão | feliz | abrir /agenda/corte, escolher amanhã 10:00, preencher nome e e-mail, confirmar | tela de confirmação, horário aparece no painel do salão, e-mail pros dois | auto | |
| C01-B1 | | borda: horário ocupado enquanto o cliente preenche | | aviso claro, escolhe outro horário, nada de dois clientes no mesmo horário | auto | |
| C01-B2 | | borda: cliente em outro fuso horário | | horário mostrado no fuso do cliente, guardado num fuso só | auto | |
| C01-E1 | | erro: cartão recusado | | mensagem de erro, nenhum horário marcado | mão | |
