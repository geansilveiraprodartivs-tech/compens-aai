package br.com.compensai;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Plugin nativo de apps de banco/carteira.
 *
 * Duas capacidades independentes:
 *  1) DESCOBERTA REAL: {@link #listApps} varre os aplicativos INSTALADOS no aparelho
 *     (via PackageManager / CATEGORY_LAUNCHER) e devolve nome, ícone e uma
 *     classificação (banco / carteira / outro). Nada é simulado: aplicativos
 *     desinstalados não aparecem e nada é inventado.
 *  2) ABERTURA: {@link #openApp} abre qualquer pacote descoberto e
 *     {@link #openConfiguredBank} abre a lista pré-cadastrada do CompensAI.
 *
 * Nenhuma lista estática é usada para "descobrir" apps — o catálogo abaixo só serve
 * para ROTULAR os apps encontrados e manter os botões pré-salvos existentes.
 */
@CapacitorPlugin(name = "BankApps")
public class BankAppsPlugin extends Plugin {

    /** Bancos "cadastrados" no CompensAI (botões fixos pré-salvos). Não são uma descoberta. */
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

    /** Demais instituições reconhecidas — usadas só para rotular descobertas. */
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

    /** Pacotes que são CARTEIRA DIGITAL (usados só para rotular). */
    static final String[] WALLET_PACKAGES = {
            "com.google.android.apps.walletnfcrel",
            "com.samsung.android.spay",
            "com.paypal.android.p2pmobile",
            "com.transferwise.android",
            "com.revolut.revolut",
            "com.picpay",
            "com.mercadopago.wallet",
            "com.pay99.wallet",
            "com.recarga.recarga",
            "io.cloudwalk.infinitepaydash",
            "br.com.cakto",
            "com.nu.production.wallet",
    };

    /**
     * Palavras que indicam banco/carteira quando o app não está no catálogo.
     * Casadas como PALAVRA INTEIRA (não substring) para evitar falsos positivos como
     * "Pinterest"/"interactive" batendo com "inter".
     */
    static final String[] FINANCIAL_KEYWORDS = {
            "banco", "bank", "banking", "carteira", "wallet", "pagamento", "pagamentos",
            "pix", "credito", "crédito", "financeira", "investimento", "investimentos",
            "corretora", "nubank", "itau", "itaú", "bradesco", "santander", "caixa",
            "sicoob", "sicredi", "banrisul", "mercantil", "bancopan", "bmg", "btg",
            "inter", "neon", "next", "picpay", "pagbank", "mercadopago", "mercado pago",
            "paypal", "wise", "revolut", "recarga", "ton", "infinitepay", "c6",
    };

    private static boolean isWordChar(char c) {
        return Character.isLetterOrDigit(c);
    }

    /** Verifica se `word` aparece em `haystack` delimitada por fronteiras de palavra. */
    private static boolean hasWord(String haystack, String word) {
        if (word == null || word.isEmpty()) return false;
        int from = 0;
        while (true) {
            int idx = haystack.indexOf(word, from);
            if (idx < 0) return false;
            int before = idx - 1;
            int after = idx + word.length();
            boolean okBefore = before < 0 || !isWordChar(haystack.charAt(before));
            boolean okAfter = after >= haystack.length() || !isWordChar(haystack.charAt(after));
            if (okBefore && okAfter) return true;
            from = idx + 1;
        }
    }

    // ------------------------------------------------------------------
    // Utilitários
    // ------------------------------------------------------------------

    private boolean isWalletPackage(String pkg) {
        for (String w : WALLET_PACKAGES) {
            if (w.equals(pkg)) return true;
        }
        return false;
    }

    private String catalogLabel(String pkg) {
        for (String[] app : KNOWN_BANK_APPS) {
            if (app[1].equals(pkg)) return app[0];
        }
        for (String[] app : OTHER_BANK_APPS) {
            if (app[1].equals(pkg)) return app[0];
        }
        return null;
    }

    private String classify(String pkg, String label) {
        if (catalogLabel(pkg) != null) {
            return isWalletPackage(pkg) ? "wallet" : "bank";
        }
        String haystack = (pkg + " " + (label == null ? "" : label)).toLowerCase(new Locale("pt", "BR"));
        if (hasWord(haystack, "wallet") || hasWord(haystack, "carteira") || hasWord(haystack, "pay")) {
            return "wallet";
        }
        for (String kw : FINANCIAL_KEYWORDS) {
            if (hasWord(haystack, kw)) return "bank";
        }
        return "other";
    }

    private boolean isFinancial(String category, String pkg, String label) {
        if (!"other".equals(category)) return true;
        String haystack = (pkg + " " + (label == null ? "" : label)).toLowerCase(new Locale("pt", "BR"));
        if (hasWord(haystack, "wallet") || hasWord(haystack, "carteira") || hasWord(haystack, "pay")) {
            return true;
        }
        for (String kw : FINANCIAL_KEYWORDS) {
            if (hasWord(haystack, kw)) return true;
        }
        return false;
    }

    /** Ícone do app como data URL (PNG base64), reduzido para no máximo 96px. */
    private String iconDataUrl(PackageManager pm, ResolveInfo ri) {
        try {
            Drawable drawable = ri.loadIcon(pm);
            if (drawable == null) return null;
            Bitmap bitmap;
            if (drawable instanceof BitmapDrawable && ((BitmapDrawable) drawable).getBitmap() != null) {
                bitmap = ((BitmapDrawable) drawable).getBitmap();
            } else {
                float density = getContext().getResources().getDisplayMetrics().density;
                int size = Math.max(1, Math.round(48 * density));
                bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);
                drawable.setBounds(0, 0, size, size);
                drawable.draw(canvas);
            }
            int max = 96;
            int w = bitmap.getWidth();
            int h = bitmap.getHeight();
            if (w > max || h > max) {
                float ratio = Math.min((float) max / w, (float) max / h);
                int nw = Math.max(1, Math.round(w * ratio));
                int nh = Math.max(1, Math.round(h * ratio));
                bitmap = Bitmap.createScaledBitmap(bitmap, nw, nh, true);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private JSObject buildEntry(PackageManager pm, ResolveInfo ri) {
        String pkg = ri.activityInfo.packageName;
        String label;
        try {
            CharSequence loaded = ri.loadLabel(pm);
            label = loaded == null ? pkg : loaded.toString();
        } catch (Exception e) {
            label = pkg;
        }
        String category = classify(pkg, label);

        JSObject entry = new JSObject();
        entry.put("package", pkg);
        entry.put("name", label);
        entry.put("category", category);
        entry.put("financial", isFinancial(category, pkg, label));
        entry.put("label", label);
        String icon = iconDataUrl(pm, ri);
        if (icon != null) entry.put("icon", icon);
        return entry;
    }

    // ------------------------------------------------------------------
    // Descoberta REAL dos apps instalados
    // ------------------------------------------------------------------

    /**
     * Lista os aplicativos INSTALADOS no aparelho que podem ser abertos por um
     * launcher (Category LAUNCHER). Não usa lista fixa: o conjunto vem do próprio
     * sistema. Cada item traz nome, ícone e uma classificação (banco/carteira/outro).
     */
    @PluginMethod
    public void listApps(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN);
            main.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> launchers = pm.queryIntentActivities(main, 0);

            String self = getContext().getPackageName();
            Set<String> seen = new HashSet<>();
            JSArray apps = new JSArray();
            for (ResolveInfo ri : launchers) {
                if (ri == null || ri.activityInfo == null) continue;
                String pkg = ri.activityInfo.packageName;
                if (pkg == null || pkg.equals(self)) continue;
                if (!seen.add(pkg)) continue;
                try {
                    apps.put(buildEntry(pm, ri));
                } catch (Exception ignored) {
                    // ignora falha individual
                }
            }

            JSObject ret = new JSObject();
            ret.put("apps", apps);
            ret.put("total", apps.length());
            ret.put("supported", true);
            call.resolve(ret);
        } catch (Exception e) {
            // Mesmo com falha, respondemos com estrutura válida para o frontend.
            JSObject ret = new JSObject();
            ret.put("apps", new JSArray());
            ret.put("total", 0);
            ret.put("supported", true);
            ret.put("error", e.getMessage() == null ? "failed" : e.getMessage());
            call.resolve(ret);
        }
    }

    // ------------------------------------------------------------------
    // Abertura
    // ------------------------------------------------------------------

    /** Abre um app descoberto pelo pacote informado. */
    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = call.getString("package");
        if (pkg == null || pkg.trim().isEmpty()) {
            call.reject("PACKAGE_REQUIRED", "PACKAGE_REQUIRED");
            return;
        }
        JSObject result = new JSObject();
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage(pkg);
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

    /**
     * Abre o app da instituição pré-cadastrada usando o pacote/scheme predefinido.
     * Mantém o comportamento existente dos botões fixos do CompensAI.
     */
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

    /**
     * Abre uma URL externa usando o mecanismo nativo do Android (ACTION_VIEW).
     * Serve de fallback do login quando o plugin Browser nao esta no build.
     */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL_REQUIRED", "URL_REQUIRED");
            return;
        }
        JSObject result = new JSObject();
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
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
