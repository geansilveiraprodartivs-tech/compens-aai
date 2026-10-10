package br.com.compensai;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BankAppsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
