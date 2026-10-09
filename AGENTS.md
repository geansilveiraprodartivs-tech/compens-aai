<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Home-screen installation uses a manifest and CDN-backed PNG icon variants, without a service worker; offline caching is not requested.

The authenticated experience uses a responsive shopping-command-center shell: desktop sidebar and mobile bottom navigation, preserving the same five destinations.

## Git / Push (memorizado)

- Conta GitHub usada para autenticar o push: **`geansilveiraprodartivs-tech`** (github.com/geansilveiraprodartivs-tech, dono do repo `compens-aai`). Não usar outra conta.
- Push via HTTPS + Git Credential Manager: quando o push ficar pendurado, pedir ao usuário para aprovar a janela do GCM (barra de tarefas) / login no navegador; depois retentar `git push origin main`.
- `gh` CLI NÃO instalado; não depender dele.
- Repo usa Bun (não commitar `package-lock.json`).
- Sempre commitar e push sem perguntar (a menos que o usuário peça o contrário).

## Pendência

- Guia de build local do APK Android (plugin `BankApps` já no repo) — usuário pediu para deixar para depois.
