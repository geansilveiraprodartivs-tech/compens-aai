package br.com.compensai;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "BankApps")
public class BankAppsPlugin extends Plugin {
    private static final int ICON_SIZE_PX = 96;

    /* Android does not classify all banking apps consistently. Each candidate is still checked
       against PackageManager, so only installed apps with a real launch activity are returned. */
    private static final String[][] COMPATIBLE_APPS = {
            {"com.nu.production"},
            {"com.itau"},
            {"com.bradesco"},
            {"br.com.bb.android"},
            {"br.gov.caixa.tem"},
            {"br.com.gabba.Caixa"},
            {"com.santander.app"},
            {"br.com.intermedium"},
            {"com.picpay"},
            {"com.mercadopago.wallet"},
            {"br.com.uol.ps.myaccount"},
            {"com.c6bank.app"},
            {"br.com.neon"},
            {"br.com.bradesco.next"},
            {"br.com.sicoobnet"},
            {"br.com.sicredimobi.smart"},
            {"br.com.bancopan.cartoes"},
            {"com.votorantim.bvpd"},
            {"com.btg.pactual.banking"},
            {"br.com.bancobmg.bancodigital"},
            {"com.mercantil"},
            {"br.com.banrisul"},
            {"br.com.digio"},
            {"br.com.cora.bank"},
            {"br.com.stone.ton"},
            {"io.cloudwalk.infinitepaydash"},
            {"com.recarga.recarga"},
            {"com.pay99.wallet"},
            {"br.com.unicredmobile"},
            {"br.com.a27bank"},
            {"br.com.koin"},
            {"br.com.dmcard.contadigital"},
            {"br.com.agipag.app"},
            {"br.com.meliuz"},
            {"com.google.android.apps.walletnfcrel"},
            {"com.samsung.android.spay"},
            {"com.paypal.android.p2pmobile"},
            {"com.transferwise.android"},
            {"com.revolut.revolut"},
            {"br.gov.caixa.fgts.trabalhador"},
            {"br.com.cakto"},
    };

    private String iconDataUrl(Drawable icon) {
        if (icon == null) return "";

        try {
            Bitmap bitmap = Bitmap.createBitmap(ICON_SIZE_PX, ICON_SIZE_PX, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            icon.setBounds(0, 0, ICON_SIZE_PX, ICON_SIZE_PX);
            icon.draw(canvas);

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
            bitmap.recycle();
            return "data:image/png;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        }
    }

    private Intent launchIntent(PackageManager pm, String packageName) {
        Intent launch = pm.getLaunchIntentForPackage(packageName);
        return launch != null && pm.resolveActivity(launch, 0) != null ? launch : null;
    }

    private boolean isCompatiblePackage(String packageName) {
        for (String[] candidate : COMPATIBLE_APPS) {
            if (candidate[0].equals(packageName)) return true;
        }
        return false;
    }

    private JSArray discoverBankApps() {
        PackageManager pm = getContext().getPackageManager();
        JSArray banks = new JSArray();

        for (String[] candidate : COMPATIBLE_APPS) {
            String packageName = candidate[0];
            Intent launch = launchIntent(pm, packageName);
            if (launch == null) continue;

            ResolveInfo activity = pm.resolveActivity(launch, 0);
            CharSequence appLabel = activity == null ? null : activity.loadLabel(pm);
            String label = appLabel == null ? packageName : appLabel.toString();
            JSObject bank = new JSObject();
            bank.put("id", packageName);
            bank.put("name", label);
            bank.put("label", label);
            bank.put("icon", activity == null ? "" : iconDataUrl(activity.loadIcon(pm)));
            banks.put(bank);
        }

        return banks;
    }

    /** Discovers installed compatible apps without opening any of them. */
    @PluginMethod
    public void getInstalledBanks(PluginCall call) {
        JSObject result = new JSObject();
        result.put("banks", discoverBankApps());
        call.resolve(result);
    }

    /** Opens only the compatible app the user selected in the device list. */
    @PluginMethod
    public void openBank(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("Bank id is required", "INVALID_BANK_ID");
            return;
        }
        if (!isCompatiblePackage(id)) {
            call.reject("Unsupported bank app: " + id, "UNSUPPORTED_BANK");
            return;
        }

        PackageManager pm = getContext().getPackageManager();
        Intent intent = launchIntent(pm, id);
        if (intent == null) {
            call.reject("Bank app not installed: " + id, "BANK_NOT_INSTALLED");
            return;
        }

        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            JSObject result = new JSObject();
            result.put("opened", false);
            result.put("error", error.getMessage());
            call.resolve(result);
        }
    }
}
