package br.com.compensai;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "BankApps")
public class BankAppsPlugin extends Plugin {
    /* Android has no reliable category for every bank app. This registry only defines
       compatible candidates; PackageManager verifies that each one is installed and launchable. */
    private static final String[] COMPATIBLE_PACKAGES = {
            "com.nu.production", "com.itau", "com.bradesco", "br.com.bb.android",
            "br.gov.caixa.tem", "br.com.gabba.Caixa", "com.santander.app",
            "br.com.intermedium", "com.picpay", "com.mercadopago.wallet",
            "br.com.uol.ps.myaccount", "com.c6bank.app", "br.com.neon",
            "br.com.bradesco.next", "br.com.sicoobnet", "br.com.sicredimobi.smart",
            "br.com.bancopan.cartoes", "com.votorantim.bvpd", "com.btg.pactual.banking",
            "br.com.bancobmg.bancodigital", "com.mercantil", "br.com.banrisul",
            "br.com.digio", "br.com.cora.bank", "br.com.stone.ton",
            "io.cloudwalk.infinitepaydash", "com.recarga.recarga", "com.pay99.wallet",
            "br.com.unicredmobile", "br.com.a27bank", "br.com.koin",
            "br.com.dmcard.contadigital", "br.com.agipag.app", "br.com.meliuz",
            "com.google.android.apps.walletnfcrel", "com.samsung.android.spay",
            "com.paypal.android.p2pmobile", "com.transferwise.android", "com.revolut.revolut",
            "br.gov.caixa.fgts.trabalhador", "br.com.cakto"
    };

    private Intent launchIntent(PackageManager pm, String packageName) {
        Intent launch = pm.getLaunchIntentForPackage(packageName);
        return launch != null && pm.resolveActivity(launch, 0) != null ? launch : null;
    }

    /** Opens the Android system chooser without opening any bank before the user's choice. */
    @PluginMethod
    public void openBankChooser(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Set<String> installedPackages = new HashSet<>();

        for (String packageName : COMPATIBLE_PACKAGES) {
            if (launchIntent(pm, packageName) != null) installedPackages.add(packageName);
        }
        if (installedPackages.isEmpty()) {
            call.reject("No bank apps installed", "NO_BANK_APPS");
            return;
        }

        Intent launcher = new Intent(Intent.ACTION_MAIN);
        launcher.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> launcherActivities = pm.queryIntentActivities(launcher, 0);
        List<ComponentName> excluded = new ArrayList<>();
        for (ResolveInfo activity : launcherActivities) {
            if (activity.activityInfo == null || installedPackages.contains(activity.activityInfo.packageName)) {
                continue;
            }
            excluded.add(new ComponentName(activity.activityInfo.packageName, activity.activityInfo.name));
        }

        try {
            Intent chooser = Intent.createChooser(launcher, "Escolha o app do banco");
            if (!excluded.isEmpty()) {
                chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, excluded.toArray(new ComponentName[0]));
            }
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("count", installedPackages.size());
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Failed to open bank chooser" : error.getMessage(), "CHOOSER_FAILED");
        }
    }
}
