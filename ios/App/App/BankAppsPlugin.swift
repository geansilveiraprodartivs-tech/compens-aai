import Capacitor
import Foundation

/**
 * iOS does not expose a system picker or an API to enumerate installed apps. This plugin makes
 * that limitation explicit instead of simulating a picker or opening an unverified URL scheme.
 */
@objc(BankAppsPlugin)
public class BankAppsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BankAppsPlugin"
    public let jsName = "BankApps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openBankChooser", returnType: CAPPluginReturnPromise)
    ]

    @objc public func openBankChooser(_ call: CAPPluginCall) {
        call.reject("IOS_SELECTOR_UNAVAILABLE", "IOS_SELECTOR_UNAVAILABLE")
    }
}
