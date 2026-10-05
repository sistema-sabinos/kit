# Molde dos projetos

Esta pasta é o molde de onde o SabinOS copia cada projeto novo. Não trabalhe
aqui nem edite nada dela: mudança feita no molde some na próxima atualização
do kit, e projeto nenhum recebe ela.

Pra criar um projeto, abra a pasta-mãe (um nível acima desta) no VS Code e
diga "primeiro projeto" ou "adicionar projeto". O Claude copia daqui só o que
o seu negócio precisa e monta a pasta nova pra você. Detalhes no
[README](../README.md) da pasta-mãe.

A biblioteca de modelos de comando (`templates/`) também mora aqui; ela não vai
pros projetos, e o `/mapear` de cada projeto busca nela quando você quer criar
um comando novo.
