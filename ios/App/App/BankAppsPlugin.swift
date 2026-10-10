import Foundation
import Capacitor
import UIKit

/**
 * BankApps — versão iOS do plugin homônimo do Android.
 *
 * API exposta ao JS (idêntica à do Android, para o web/TS ser agnóstico de plataforma):
 *   - getInstalledBanks() -> { banks: [{ id, name, label, icon }] }   (bancos "cadastrados")
 *   - getOtherBankApps()  -> { banks: [...] }                          ("Escolher outro app bancário")
 *   - openBank({ id })    -> { opened: true } | { opened: false, error }
 *
 * Diferenca fundamental em relacao ao Android:
 *   O iOS NAO permite listar os aplicativos instalados. A unica forma suportada de
 *   detectar/abrir outro app e por URL scheme, e apenas schemes declarados em
 *   `LSApplicationQueriesSchemes` (Info.plist) podem ser testados via `canOpenURL`.
 *   Nao existe varredura de pacotes nem seletor de apps no iOS.
 *
 * Por isso o "catalogo" aqui e uma tabela banco -> URL scheme. NENHUM scheme e
 * inventado: cada entrada comeca com `scheme == nil` e `verified == false` e so passa
 * a ser retornada depois de o scheme real ser CONFIRMADO no dispositivo (canOpenURL).
 * O passo a passo de verificacao esta em `docs/ios-bank-apps.md` (requer Mac + Xcode).
 *
 * Enquanto nao houver schemes verificados, os metodos retornam lista vazia e o web
 * mostra a mensagem honesta — sem prometer compatibilidade que nao foi comprovada.
 */
@objc(BankAppsPlugin)
public class BankAppsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BankAppsPlugin"
    public let jsName = "BankApps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getInstalledBanks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getOtherBankApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBank", returnType: CAPPluginReturnPromise)
    ]

    /// Entrada do catalogo. `scheme` deve ser o URL scheme REAL do app do banco
    /// (a ser confirmado no dispositivo). `verified` so vira `true` apos confirmacao
    /// via canOpenURL em iOS real; ate la a entrada e ignorada.
    struct BankEntry {
        let name: String
        var scheme: String?
        var verified: Bool
    }

    /// Bancos "cadastrados" no CompensAI (mesma lista do Android).
    /// TODO(Mac/iOS): confirmar e preencher `scheme` + `verified = true` para cada um.
    /// NAO preencher com valores supostos — ver docs/ios-bank-apps.md.
    private var knownBanks: [BankEntry] = [
        BankEntry(name: "Nubank", scheme: nil, verified: false),
        BankEntry(name: "Itaú", scheme: nil, verified: false),
        BankEntry(name: "Bradesco", scheme: nil, verified: false),
        BankEntry(name: "Banco do Brasil", scheme: nil, verified: false),
        BankEntry(name: "Caixa Tem", scheme: nil, verified: false),
        BankEntry(name: "Caixa", scheme: nil, verified: false),
        BankEntry(name: "Santander", scheme: nil, verified: false),
        BankEntry(name: "Inter", scheme: nil, verified: false),
        BankEntry(name: "PicPay", scheme: nil, verified: false),
        BankEntry(name: "Mercado Pago", scheme: nil, verified: false),
        BankEntry(name: "PagBank", scheme: nil, verified: false),
    ]

    /// Demais bancos/carteiras reconhecidos (opcao "Escolher outro app bancario").
    /// TODO(Mac/iOS): idem — confirmar schemes antes de habilitar.
    private var otherBanks: [BankEntry] = [
        BankEntry(name: "C6 Bank", scheme: nil, verified: false),
        BankEntry(name: "Neon", scheme: nil, verified: false),
        BankEntry(name: "Next", scheme: nil, verified: false),
        BankEntry(name: "Sicoob", scheme: nil, verified: false),
        BankEntry(name: "Sicredi", scheme: nil, verified: false),
        BankEntry(name: "Banco Pan", scheme: nil, verified: false),
        BankEntry(name: "BV", scheme: nil, verified: false),
        BankEntry(name: "BTG Pactual", scheme: nil, verified: false),
        BankEntry(name: "Banco BMG", scheme: nil, verified: false),
        BankEntry(name: "Banrisul", scheme: nil, verified: false),
        BankEntry(name: "Digio", scheme: nil, verified: false),
        BankEntry(name: "Cora", scheme: nil, verified: false),
        BankEntry(name: "Ton (Stone)", scheme: nil, verified: false),
        BankEntry(name: "InfinitePay", scheme: nil, verified: false),
        BankEntry(name: "RecargaPay", scheme: nil, verified: false),
        BankEntry(name: "99Pay", scheme: nil, verified: false),
        BankEntry(name: "Unicred", scheme: nil, verified: false),
        BankEntry(name: "PayPal", scheme: nil, verified: false),
        BankEntry(name: "Wise", scheme: nil, verified: false),
        BankEntry(name: "Revolut", scheme: nil, verified: false),
    ]

    /// Retorna apenas entradas cujo scheme foi verificado E cujo app responde a canOpenURL.
    private func collect(_ banks: [BankEntry]) -> [[String: Any]] {
        var out: [[String: Any]] = []
        for bank in banks {
            guard bank.verified, let scheme = bank.scheme, !scheme.isEmpty,
                  let url = URL(string: scheme), UIApplication.shared.canOpenURL(url) else {
                continue
            }
            out.append([
                "id": scheme,
                "name": bank.name,
                "label": bank.name,
                "icon": "",
            ])
        }
        return out
    }

    private func isCatalogScheme(_ scheme: String) -> Bool {
        for bank in (knownBanks + otherBanks) where bank.verified && bank.scheme == scheme {
            return true
        }
        return false
    }

    @objc public func getInstalledBanks(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["banks": self.collect(self.knownBanks)])
        }
    }

    @objc public func getOtherBankApps(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["banks": self.collect(self.otherBanks)])
        }
    }

    @objc public func openBank(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty, let url = URL(string: id) else {
            call.reject("Bank scheme is required", "INVALID_BANK_ID")
            return
        }
        guard isCatalogScheme(id) else {
            call.reject("Unknown bank app: \(id)", "UNKNOWN_BANK")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.canOpenURL(url) else {
                call.resolve(["opened": false, "error": "Bank app not installed: \(id)"])
                return
            }
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve(["opened": true])
                } else {
                    call.resolve(["opened": false, "error": "Failed to open: \(id)"])
                }
            }
        }
    }
}
