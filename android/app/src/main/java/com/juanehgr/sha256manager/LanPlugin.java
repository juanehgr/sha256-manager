package com.juanehgr.sha256manager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;

@CapacitorPlugin(name = "Lan")
public class LanPlugin extends Plugin {

    @PluginMethod
    public void getIpv4(PluginCall call) {
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            if (nis == null) {
                call.reject("no interfaces");
                return;
            }
            for (NetworkInterface ni : Collections.list(nis)) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
                if (name.contains("rmnet") || name.contains("dummy")) continue;
                for (InetAddress addr : Collections.list(ni.getInetAddresses())) {
                    if (!(addr instanceof Inet4Address) || addr.isLoopbackAddress()) continue;
                    String ip = addr.getHostAddress();
                    if (ip == null || ip.startsWith("127.") || ip.startsWith("169.254.")) continue;
                    JSObject ret = new JSObject();
                    ret.put("ip", ip);
                    call.resolve(ret);
                    return;
                }
            }
            call.reject("no wifi ip");
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void tcpJson(PluginCall call) {
        final String host = call.getString("host");
        final Integer port = call.getInt("port", 4028);
        final String payload = call.getString("payload", "{}");
        final Integer timeoutMs = call.getInt("timeoutMs", 900);
        if (host == null || host.isEmpty()) {
            call.reject("host required");
            return;
        }
        new Thread(() -> {
            Socket sock = new Socket();
            try {
                sock.connect(new InetSocketAddress(host, port), timeoutMs);
                sock.setSoTimeout(timeoutMs);
                OutputStream out = sock.getOutputStream();
                out.write((payload + "\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
                InputStream in = sock.getInputStream();
                byte[] buf = new byte[8192];
                StringBuilder sb = new StringBuilder();
                int n;
                try {
                    while ((n = in.read(buf)) != -1) {
                        sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                        String t = sb.toString().replace("\0", "").trim();
                        if (t.startsWith("{") && t.endsWith("}")) break;
                    }
                } catch (Exception ignored) {
                    /* timeout with partial JSON is common for cgminer */
                }
                String cleaned = sb.toString().replace("\0", "").trim();
                if (cleaned.isEmpty()) {
                    call.reject("empty");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("data", cleaned);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "tcp fail" : e.getMessage());
            } finally {
                try {
                    sock.close();
                } catch (Exception ignored) {
                }
            }
        }).start();
    }
}
