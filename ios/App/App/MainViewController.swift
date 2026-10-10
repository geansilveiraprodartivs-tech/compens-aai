import UIKit
import Capacitor

/**
 * MainViewController — necessário para registrar o plugin local `BankApps`.
 *
 * O Capacitor no iOS só carrega automaticamente plugins instalados via npm
 * (lista `packageClassList` em capacitor.config.json). Plugins locais dentro do
 * alvo do app precisam ser registrados manualmente aqui, sobrescrevendo
 * `capacitorDidLoad()`.
 *
 * Referência: https://capacitorjs.com/docs/ios/custom-code#register-the-plugin
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BankAppsPlugin())
    }
}
