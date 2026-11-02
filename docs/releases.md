# Releases e atualização

## Publicação automática

O workflow `Release` executa em pushes com mudanças de código para `main` ou `testing`. Alterações apenas em Markdown, `docs`, `LICENSE` ou `.gitignore` não geram uma versão. O botão **Run workflow** permite publicar manualmente, escolher patch/minor/major ou desmarcar `publish` para produzir apenas um artefato assinado.

O canal é determinado pela branch; o workflow recusa qualquer outra branch. Não há merge automático entre canais.

| Branch | Tag | GitHub | Endpoint do updater |
| --- | --- | --- | --- |
| `main` | `vX.Y.Z` | release estável, Latest | `/releases/latest/download/latest.json` |
| `testing` | `vX.Y.Z-testing.N` | prerelease | `/releases/download/channel-testing/latest.json` |

Os endpoints são definidos durante a compilação. A versão estável consulta somente releases estáveis; o beta consulta somente o ponteiro `channel-testing`.

## Versionamento

O primeiro lançamento usa a versão de `package.json`. Depois, o workflow calcula a próxima versão a partir da maior tag estável:

- Depois de `v0.1.0`, os betas são `v0.1.1-testing.1`, `v0.1.1-testing.2`, etc.
- O próximo push em `main` publica `v0.1.1`.
- O próximo beta passa a `v0.1.2-testing.1`.
- Uma versão maior definida explicitamente em `package.json` é respeitada.

As versões são aplicadas aos metadados do build sem commits automáticos na branch. Os workflows do mesmo canal são serializados para evitar concorrência de tags.

## Assinatura do updater

O repositório precisa dos secrets do GitHub Actions:

- `TAURI_SIGNING_PRIVATE_KEY`: a chave privada gerada pelo CLI do Tauri.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: a senha correspondente; pode estar vazia se a chave foi criada sem senha.

A chave **pública** correspondente fica em `src-tauri/tauri.conf.json`, em `plugins.updater.pubkey`. A chave privada nunca deve entrar no repositório. Mantenha uma cópia segura da chave privada: os apps já instalados confiam nessa chave pública para verificar atualizações futuras.

A assinatura do updater verifica a integridade dos pacotes do Gemdrop. Ela é diferente de uma assinatura de código Authenticode do Windows.

## Ordem de publicação

1. Calcular versão e canal e testar as regras de release.
2. Instalar dependências pelos lockfiles e aplicar a versão e o endpoint ao build.
3. Executar TypeScript, testes do frontend e testes Rust.
4. Compilar o NSIS e gerar a assinatura do updater.
5. Preparar instalador, ZIP portátil, assinatura, checksums e `latest.json`.
6. Guardar tudo como artefato do Actions.
7. Criar a release como rascunho, anexar todos os arquivos e publicar.
8. Se for beta, atualizar os links permanentes e o manifesto de `channel-testing`.

Uma falha de teste ou build impede a publicação e preserva o ponteiro da versão anterior. O manifesto do beta aponta para arquivos da tag versionada, evitando misturar um instalador antigo com uma assinatura nova.

A distribuição inicial é Windows x64. O instalador requer WebView2; o NSIS configura esse runtime quando necessário. A versão portátil utiliza o WebView2 já instalado no computador.
