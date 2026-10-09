package br.com.compensai;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(name = "BankApps")
public class BankAppsPlugin extends Plugin {

    static final String[][] KNOWN_BANK_APPS = {
            {"Nubank", "com.nu.production"},
            {"Itaú", "com.itau"},
            {"Bradesco", "com.bradesco"},
            {"Banco do Brasil", "br.com.bb.android"},
            {"Caixa Tem", "br.gov.caixa.tem"},
            {"Caixa", "br.com.gabba.Caixa"},
            {"Santander", "com.santander.app"},
            {"Inter", "br.com.intermedium"},
            {"PicPay", "com.picpay"},
            {"Mercado Pago", "com.mercadopago.wallet"},
            {"PagBank", "br.com.uol.ps.myaccount"},
    };

    static final List<String> KNOWN_PACKAGES = new ArrayList<>();

    static {
        for (String[] app : KNOWN_BANK_APPS) {
            KNOWN_PACKAGES.add(app[1]);
        }
    }

    @PluginMethod
    public void getInstalledBanks(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSArray result = new JSArray();
        for (String[] app : KNOWN_BANK_APPS) {
            String id = app[1];
            Intent intent = pm.getLaunchIntentForPackage(id);
            if (intent == null) {
                continue;
            }
            try {
                ResolveInfo ri = pm.resolveActivity(intent, 0);
                JSObject entry = new JSObject();
                entry.put("id", id);
                entry.put("name", app[0]);
                String label = ri != null && ri.loadLabel(pm) != null
                        ? ri.loadLabel(pm).toString()
                        : app[0];
                entry.put("label", label);
                String icon = "https://play-lh.googleusercontent.com/" + id;
                entry.put("icon", icon);
                result.put(entry);
            } catch (Exception e) {
                // ignore individual failures
            }
        }
        JSObject ret = new JSObject();
        ret.put("banks", result);
        call.resolve(ret);
    }

    private String findNameFor(String id) {
        for (String[] app : KNOWN_BANK_APPS) {
            if (app[1].equals(id)) {
                return app[0];
            }
        }
        return id;
    }

    @PluginMethod
    public void openBank(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("Bank id is required", "INVALID_BANK_ID");
            return;
        }
        if (!KNOWN_PACKAGES.contains(id)) {
            call.reject("Unknown bank app: " + id, "UNKNOWN_BANK");
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        Intent intent = pm.getLaunchIntentForPackage(id);
        if (intent == null) {
            call.reject("Bank app not installed: " + id, "BANK_NOT_INSTALLED");
            return;
        }
        JSObject ret = new JSObject();
        try {
            getContext().startActivity(intent);
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("opened", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }
}