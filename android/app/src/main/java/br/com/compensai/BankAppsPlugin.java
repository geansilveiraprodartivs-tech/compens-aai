package br.com.compensai;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import java.util.ArrayList;
import java.util.List;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BankApps")
public class BankAppsPlugin extends Plugin {

    /**
     * Bancos/carteiras "cadastrados" no CompensAI: aparecem como botões fixos quando
     * instalados no aparelho. Mantém exatamente a lista já existente.
     */
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

    /**
     * Demais bancos e carteiras digitais reconhecidos pelo CompensAI. Só entram na tela
     * "Escolher outro app bancário" quando realmente instalados no aparelho. Package names
     * verificados na Google Play Store.
     */
    static final String[][] OTHER_BANK_APPS = {
            {"C6 Bank", "com.c6bank.app"},
            {"Neon", "br.com.neon"},
            {"Next", "br.com.bradesco.next"},
            {"Sicoob", "br.com.sicoobnet"},
            {"Sicredi", "br.com.sicredimobi.smart"},
            {"Banco Pan", "br.com.bancopan.cartoes"},
            {"BV", "com.votorantim.bvpd"},
            {"BTG Pactual", "com.btg.pactual.banking"},
            {"Banco BMG", "br.com.bancobmg.bancodigital"},
            {"Banco Mercantil", "com.mercantil"},
            {"Banrisul", "br.com.banrisul"},
            {"Digio", "br.com.digio"},
            {"Cora", "br.com.cora.bank"},
            {"Ton (Stone)", "br.com.stone.ton"},
            {"InfinitePay", "io.cloudwalk.infinitepaydash"},
            {"RecargaPay", "com.recarga.recarga"},
            {"99Pay", "com.pay99.wallet"},
            {"Unicred", "br.com.unicredmobile"},
            {"Banco A27", "br.com.a27bank"},
            {"Koin", "br.com.koin"},
            {"DM - Conta Digital", "br.com.dmcard.contadigital"},
            {"AgiPay", "br.com.agipag.app"},
            {"Google Wallet", "com.google.android.apps.walletnfcrel"},
            {"Samsung Wallet", "com.samsung.android.spay"},
            {"PayPal", "com.paypal.android.p2pmobile"},
            {"Wise", "com.transferwise.android"},
            {"Revolut", "com.revolut.revolut"},
    };

    private void collect(JSArray out, String[][] apps) {
        PackageManager pm = getContext().getPackageManager();
        for (String[] app : apps) {
            String id = app[1];
            Intent launch = pm.getLaunchIntentForPackage(id);
            if (launch == null) {
                continue;
            }
            try {
                ResolveInfo ri = pm.resolveActivity(launch, 0);
                JSObject entry = new JSObject();
                entry.put("id", id);
                entry.put("name", app[0]);
                String label = ri != null && ri.loadLabel(pm) != null
                        ? ri.loadLabel(pm).toString()
                        : app[0];
                entry.put("label", label);
                entry.put("icon", "");
                out.put(entry);
            } catch (Exception e) {
                // ignore individual failures
            }
        }
    }

    /** Bancos "cadastrados" instalados no aparelho (botões fixos). */
    @PluginMethod
    public void getInstalledBanks(PluginCall call) {
        JSArray result = new JSArray();
        collect(result, KNOWN_BANK_APPS);
        JSObject ret = new JSObject();
        ret.put("banks", result);
        call.resolve(ret);
    }

    /** Demais bancos/carteiras instalados (opção "Escolher outro app bancário"). */
    @PluginMethod
    public void getOtherBankApps(PluginCall call) {
        JSArray result = new JSArray();
        collect(result, OTHER_BANK_APPS);
        JSObject ret = new JSObject();
        ret.put("banks", result);
        call.resolve(ret);
    }

    private boolean isCatalogPackage(String id) {
        for (String[] app : KNOWN_BANK_APPS) {
            if (app[1].equals(id)) {
                return true;
            }
        }
        for (String[] app : OTHER_BANK_APPS) {
            if (app[1].equals(id)) {
                return true;
            }
        }
        return false;
    }

    @PluginMethod
    public void openBank(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("Bank id is required", "INVALID_BANK_ID");
            return;
        }
        if (!isCatalogPackage(id)) {
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
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("opened", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    private void addChooserTargets(PackageManager pm, List<Intent> out, String[][] apps) {
        for (String[] app : apps) {
            Intent launch = pm.getLaunchIntentForPackage(app[1]);
            if (launch == null) {
                continue;
            }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            out.add(launch);
        }
    }

    /**
     * Abre o seletor NATIVO do Android ("Abrir com") contendo apenas os apps de banco/carteira
     * instalados no aparelho. O usuário escolhe ali e o banco é aberto pelo próprio sistema.
     */
    @PluginMethod
    public void openBankChooser(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        List<Intent> targets = new ArrayList<>();
        addChooserTargets(pm, targets, KNOWN_BANK_APPS);
        addChooserTargets(pm, targets, OTHER_BANK_APPS);
        if (targets.isEmpty()) {
            call.reject("No bank apps installed", "NO_BANK_APPS");
            return;
        }
        Intent base = targets.get(0);
        Intent chooser = Intent.createChooser(base, "Escolha o app do banco");
        if (targets.size() > 1) {
            List<Intent> rest = new ArrayList<>(targets.subList(1, targets.size()));
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, rest.toArray(new Intent[0]));
        }
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        JSObject ret = new JSObject();
        try {
            getContext().startActivity(chooser);
            ret.put("opened", true);
            ret.put("count", targets.size());
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("opened", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }
}
