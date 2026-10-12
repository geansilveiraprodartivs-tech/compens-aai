import Capacitor
import Foundation
import UIKit

/**
 * Plugin nativo de apps de banco/carteira.
 *
 * LIMITAÇÃO REAL DO iOS (sem simulação): o iOS NÃO oferece nenhuma API para
 * enumerar/listar os aplicativos instalados no aparelho. Portanto `listApps`
 * devolve `supported: false` e uma lista vazia — o CompensAI mostra essa limitação
 * de forma honesta em vez de inventar aplicativos.
 *
 * A abertura continua disponível para os apps pré-cadastrados via URL scheme
 * oficial (`openConfiguredBank`), que é o mecanismo suportado pela Apple.
 */
@objc(BankAppsPlugin)
public class BankAppsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BankAppsPlugin"
    public let jsName = "BankApps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openConfiguredBank", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openApp", returnType: CAPPluginReturnPromise)
    ]

    /// iOS não permite enumerar aplicativos instalados.
    @objc public func listApps(_ call: CAPPluginCall) {
        call.resolve([
            "apps": [],
            "total": 0,
            "supported": false,
            "reason": "ios_no_enumeration"
        ])
    }

    /// iOS não abre apps por identificador de pacote (só via URL scheme declarado).
    @objc public func openApp(_ call: CAPPluginCall) {
        call.resolve([
            "opened": false,
            "reason": "ios_no_package_open"
        ])
    }

    @objc public func openConfiguredBank(_ call: CAPPluginCall) {
        guard let scheme = call.getString("iosScheme"), let url = URL(string: scheme) else {
            call.resolve(["opened": false, "reason": "not_configured"])
            return
        }
        DispatchQueue.main.async {
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
                call.resolve(["opened": true])
            } else {
                call.resolve(["opened": false, "reason": "not_installed"])
            }
        }
    }
}
