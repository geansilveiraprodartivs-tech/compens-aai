package br.com.compensai;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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
            {"Caixa FGTS", "br.gov.caixa.fgts.trabalhador"},
            {"Cakto", "br.com.cakto"},
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

    private void addChooserTargets(PackageManager pm, List<Intent> out, Set<String> installed, String[][] apps) {
        for (String[] app : apps) {
            Intent launch = pm.getLaunchIntentForPackage(app[1]);
            if (launch == null) {
                continue;
            }
            installed.add(app[1]);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            out.add(launch);
        }
    }

    /**
     * Abre o seletor NATIVO do Android ("Abrir com") contendo apenas os apps de banco/carteira
     * instalados no aparelho. Usa a lista "launcher" como base e EXCLUI todos os apps que nao
     * sao bancos do catalogo — assim o seletor mostra uma LISTA VERTICAL COMPLETA (todos os bancos),
     * em vez da fileira horizontal de "previa" que aparece quando se usa EXTRA_INITIAL_INTENTS.
     */
    @PluginMethod
    public void openBankChooser(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Set<String> installed = new HashSet<>();
        List<Intent> targets = new ArrayList<>();
        addChooserTargets(pm, targets, installed, KNOWN_BANK_APPS);
        addChooserTargets(pm, targets, installed, OTHER_BANK_APPS);
        if (targets.isEmpty()) {
            call.reject("No bank apps installed", "NO_BANK_APPS");
            return;
        }

        Intent chooser;
        try {
            Intent main = new Intent(Intent.ACTION_MAIN);
            main.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> launchers = pm.queryIntentActivities(main, 0);

            if (!launchers.isEmpty()) {
                List<ComponentName> exclude = new ArrayList<>();
                for (ResolveInfo ri : launchers) {
                    String pkg = ri.activityInfo.packageName;
                    if (!installed.contains(pkg)) {
                        exclude.add(new ComponentName(pkg, ri.activityInfo.name));
                    }
                }
                chooser = Intent.createChooser(main, "Escolha o app do banco");
                if (!exclude.isEmpty()) {
                    chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, exclude.toArray(new ComponentName[0]));
                }
            } else {
                // Fallback: sem visibilidade de launcher, monta via intents explicitos.
                chooser = Intent.createChooser(targets.get(0), "Escolha o app do banco");
                if (targets.size() > 1) {
                    List<Intent> rest = new ArrayList<>(targets.subList(1, targets.size()));
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, rest.toArray(new Intent[0]));
                }
            }
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            ret.put("count", targets.size());
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("opened", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }
}
