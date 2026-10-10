# BankApps no iOS — como funciona e o que falta verificar

## Contexto

O botão **"Escolher outro app bancário"** e os botões fixos de banco usam o plugin
nativo `BankApps`. No Android ele lista apenas apps de banco/carteira **instalados**
(catálogo filtrado por package name — não lista apps aleatórios). No iOS o mecanismo é
diferente e tem limites impostos pela Apple.

## Limitação do iOS (importante)

O iOS **não permite listar os aplicativos instalados**. Não existe equivalente ao
`PackageManager` do Android nem um seletor de apps filtrado por categoria. A única forma
suportada de detectar/abrir outro app é por **URL scheme**:

- Detectar se um app está instalado: `UIApplication.canOpenURL(_:)`
- Abrir: `UIApplication.open(_:)`
- Só é possível testar schemes declarados em **`LSApplicationQueriesSchemes`** no
  `Info.plist`. Scheme não declarado → `canOpenURL` sempre retorna `false`.

Como **não existe** uma lista pública confiável de schemes dos bancos brasileiros e o
CompeensAI **não inventa** schemes, o catálogo iOS começa **vazio/habilitado = false**.
Enquanto isso, `getInstalledBanks()` e `getOtherBankApps()` retornam lista vazia e o app
mostra a mensagem honesta (sem prometer compatibilidade).

## Onde está o código

- Plugin iOS: `ios/App/App/BankAppsPlugin.swift`
  - `knownBanks` (botões fixos) e `otherBanks` ("Escolher outro app bancário").
  - Cada entrada tem `scheme` (URL scheme real) e `verified` (bool).
  - Uma entrada só é retornada quando `verified == true` **e** o app responde ao
    `canOpenURL`.
- `Info.plist`: chave `LSApplicationQueriesSchemes` (começa vazia).
- API JS (agnóstica de plataforma): `src/lib/pix.ts` — `getInstalledBanks`,
  `getOtherBankApps`, `openInstalledBank`. No iOS o campo `id` retornado é o **scheme**.

## Como verificar o scheme de um banco (requer Mac + Xcode)

1. Instale o app do banco no iPhone/simulador e tenha o projeto aberto no Xcode.
2. Descubra o scheme candidato a partir do próprio app do banco:
   - Inspecione o `Info.plist` do app do banco (ex.: extraindo o `.ipa`, ou usando
     ferramentas como `ipatool`/`plutil`) e localize `CFBundleURLTypes` →
     `CFBundleURLSchemes`. Esses são os schemes reais declarados pelo banco.
   - Alternativa: a documentação oficial de desenvolvedor do banco (quando existir).
3. Confirme no dispositivo: adicione o scheme candidato em `LSApplicationQueriesSchemes`
   (Info.plist), rode o app e chame `canOpenURL`. Só considere verificado se retornar
   `true` com o app instalado.
4. Marque a entrada correspondente em `BankAppsPlugin.swift` com `scheme = "..."` e
   `verified = true`.
5. Repita por banco. Não habilite sem o teste acima.

## Passos no Mac/Xcode para compilar e testar (ainda NÃO executados)

> Nada abaixo roda no Windows. Enquanto isso não for feito e verificado, o iOS **não**
> deve ser declarado funcional.

```bash
npm install
npm run build
npx cap sync ios
npx cap open ios   # abre o Xcode
```

No Xcode: selecione um iPhone (físico de preferência), configure signing (Team), e rode.
Depois valide o fluxo: `/pix` → "Pagar compra" → botões de banco → "Escolher outro app
bancário" → abrir o app do banco → voltar ao CompensAI → "Já fiz o pagamento" / "Voltar".

## Checklist de validação iOS (por banco)

- [ ] Scheme confirmado via `CFBundleURLTypes` do app do banco
- [ ] Scheme adicionado em `LSApplicationQueriesSchemes`
- [ ] `canOpenURL` retornou `true` com o app instalado
- [ ] Entrada habilitada em `BankAppsPlugin.swift` (`scheme` + `verified = true`)
- [ ] Abrir pelo app leva ao banco e o "voltar" retorna ao CompensAI
- [ ] Nenhum scheme foi adicionado sem a verificação acima

## Android (já funcional e verificado em dispositivo)

- Plugin: `android/app/src/main/java/br/com/compensai/BankAppsPlugin.java`
- Catálogo por package name; lista **somente** bancos/carteiras instalados.
- Verificado via CDP no Galaxy A16 (SM-A165M): `getInstalledBanks` → 7 bancos;
  `getOtherBankApps` → vazio (exclui corretamente os já listados).
- Observação: mudanças em `src/**` só chegam ao app nativo após **Publish no Lovable**
  (o WebView carrega o site publicado via `server.url`).
