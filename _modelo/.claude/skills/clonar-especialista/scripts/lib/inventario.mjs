// Opcoes do aluno gravadas no cabecalho do inventario.md da copia-mestra (Passo 1 e Passo 4).
// nome-no-agente: sim libera o nome real na persona; primeira-pessoa: sim (5.57) deixa o
// conselheiro falar como a pessoa, so no chat com quem montou, e so vale junto do nome liberado
// (o travar-nome cobra). Sem a linha, vale nao.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const sim = (texto, chave) => new RegExp(`^${chave}:[ \\t]*sim[ \\t]*$`, 'm').test(texto)

export const opcoesDoInventario = texto => ({
  nomeNoAgente: sim(texto, 'nome-no-agente'),
  primeiraPessoa: sim(texto, 'primeira-pessoa'),
})

export const opcoesDaPasta = pasta => opcoesDoInventario(ler(join(pasta, 'inventario.md')))
