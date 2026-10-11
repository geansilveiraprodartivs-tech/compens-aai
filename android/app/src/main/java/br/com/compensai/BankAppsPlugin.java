package br.com.compensai;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
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
import java.util.Set;

@CapacitorPlugin(name = "BankApps")
public class BankAppsPlugin extends Plugin {
    private static final int ICON_SIZE_PX = 96;

    private Intent launcherIntent() {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        return intent;
    }

    private boolean isFinancialApp(ApplicationInfo app) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && app.category == ApplicationInfo.CATEGORY_FINANCE;
    }

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

    private JSArray discoverBankApps() {
        PackageManager pm = getContext().getPackageManager();
        List<ResolveInfo> launchers = pm.queryIntentActivities(launcherIntent(), PackageManager.MATCH_ALL);
        JSArray banks = new JSArray();
        Set<String> seenPackages = new HashSet<>();

        for (ResolveInfo resolved : launchers) {
            if (resolved.activityInfo == null || resolved.activityInfo.applicationInfo == null) continue;

            ApplicationInfo app = resolved.activityInfo.applicationInfo;
            String packageName = app.packageName;
            if (!isFinancialApp(app) || !seenPackages.add(packageName)) continue;

            Intent launch = pm.getLaunchIntentForPackage(packageName);
            if (launch == null || pm.resolveActivity(launch, 0) == null) continue;

            CharSequence appLabel = app.loadLabel(pm);
            String label = appLabel == null ? packageName : appLabel.toString();
            JSObject bank = new JSObject();
            bank.put("id", packageName);
            bank.put("name", label);
            bank.put("label", label);
            bank.put("icon", iconDataUrl(app.loadIcon(pm)));
            banks.put(bank);
        }

        return banks;
    }

    private boolean isDiscoveredBank(String packageName) {
        PackageManager pm = getContext().getPackageManager();
        for (ResolveInfo resolved : pm.queryIntentActivities(launcherIntent(), PackageManager.MATCH_ALL)) {
            if (resolved.activityInfo == null || resolved.activityInfo.applicationInfo == null) continue;

            ApplicationInfo app = resolved.activityInfo.applicationInfo;
            if (packageName.equals(app.packageName) && isFinancialApp(app)) return true;
        }
        return false;
    }

    /** Descobre apps financeiros lançáveis sem abrir nenhum deles. */
    @PluginMethod
    public void getInstalledBanks(PluginCall call) {
        JSObject result = new JSObject();
        result.put("banks", discoverBankApps());
        call.resolve(result);
    }

    /** Abre somente um app que a descoberta atual reconhece como financeiro e lançável. */
    @PluginMethod
    public void openBank(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("Bank id is required", "INVALID_BANK_ID");
            return;
        }
        if (!isDiscoveredBank(id)) {
            call.reject("Unsupported bank app: " + id, "UNSUPPORTED_BANK");
            return;
        }

        PackageManager pm = getContext().getPackageManager();
        Intent intent = pm.getLaunchIntentForPackage(id);
        if (intent == null || pm.resolveActivity(intent, 0) == null) {
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
