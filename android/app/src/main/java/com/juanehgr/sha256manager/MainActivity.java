package com.juanehgr.sha256manager;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
