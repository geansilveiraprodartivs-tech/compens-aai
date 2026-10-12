import Capacitor
import Foundation
import UIKit

/**
 * Abre o app da instituição escolhida pelo usuário usando SOMENTE o URL scheme
 * oficial predefinido. Não enumera nem lista aplicativos (o iOS não expõe essa
 * capacidade). As chamadas nativas são tratadas no Capacitor.
 */
@objc(BankAppsPlugin)
public class BankAppsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BankAppsPlugin"
    public let jsName = "BankApps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openConfiguredBank", returnType: CAPPluginReturnPromise)
    ]

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
