package br.com.compensai;

import android.content.Intent;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Abre o aplicativo do banco/carteira escolhido pelo usuário usando SOMENTE o
 * pacote predefinido no app (mecanismo oficial de abertura). Este plugin NÃO
 * enumera, consulta nem lista os aplicativos instalados no aparelho.
 */
@CapacitorPlugin(name = "BankApps")
public class BankAppsPlugin extends Plugin {

    @PluginMethod
    public void openConfiguredBank(PluginCall call) {
        String packageName = call.getString("androidPackage");
        if (packageName == null || packageName.trim().isEmpty()) {
            call.reject("PACKAGE_REQUIRED", "PACKAGE_REQUIRED");
            return;
        }

        JSObject result = new JSObject();
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage(packageName);
            if (intent == null) {
                result.put("opened", false);
                result.put("reason", "not_installed");
                call.resolve(result);
                return;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            result.put("opened", false);
            result.put("reason", error.getMessage() == null ? "failed" : error.getMessage());
            call.resolve(result);
        }
    }
}
