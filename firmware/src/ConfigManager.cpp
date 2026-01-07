#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include "WebIndex.h"

// --- Kalıcı Hafıza (NVS) ---
Preferences preferences;

#include <ArduinoJson.h>
#include "VictronBLE.h"

// --- Global Sunucu Nesnesi (main.cpp'den erişilecek) ---
extern AsyncWebServer server;
extern VictronBLE victronScanner;

// --- Değişkenler (main.cpp ile paylaşılacak) ---
String config_ssid = "";
String config_pass = "";
String config_boatId = "";
// Hardcoded Supabase Credentials
String config_supabaseUrl = "https://uqdtqhwrcykiufkboqsd.supabase.co";
String config_secret = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZHRxaHdyY3lraXVma2JvcXNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2OTU5NzIsImV4cCI6MjA4MzI3MTk3Mn0.Cn0K8PkuaKAX4e-orCW0xe1B-Tt6HlTZwohmCb2ABGg";
String config_victronKey = "";

// Ayarları Yükle
void loadConfig() {
    preferences.begin("victron-app", true); // Read-only mode = true
    config_ssid = preferences.getString("ssid", "");
    config_pass = preferences.getString("pass", "");
    config_boatId = preferences.getString("boatId", "");
    // Supabase URL ve Secret artik NVS'den okunmuyor, sabit.
    config_victronKey = preferences.getString("victronKey", "");
    preferences.end();
}

// Ayarları Kaydet
void saveConfig(String ssid, String pass, String boatId, String victronKey) {
    preferences.begin("victron-app", false); // Read-write mode
    preferences.putString("ssid", ssid);
    preferences.putString("pass", pass);
    preferences.putString("boatId", boatId);
    // URL ve Secret kaydedilmiyor
    preferences.putString("victronKey", victronKey);
    preferences.end();
}

// Web Sunucusunu Başlat
void setupWebServer() {
    // Anasayfa
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send_P(200, "text/html", index_html);
    });

    // Form Gönderimi (POST)
    server.on("/save", HTTP_POST, [](AsyncWebServerRequest *request){
        String ssid = "", pass = "", boatId = "", victronKey = "";

        if (request->hasParam("ssid", true)) ssid = request->getParam("ssid", true)->value();
        if (request->hasParam("pass", true)) pass = request->getParam("pass", true)->value();
        if (request->hasParam("boatId", true)) boatId = request->getParam("boatId", true)->value();
        if (request->hasParam("victronKey", true)) victronKey = request->getParam("victronKey", true)->value();

        // Boşlukları temizle
        ssid.trim(); pass.trim(); boatId.trim(); victronKey.trim();

        if (ssid.length() > 0 && boatId.length() > 0) {
            saveConfig(ssid, pass, boatId, victronKey);
            request->send(200, "text/html", "<h1>Ayarlar Kaydedildi!</h1><p>Cihaz yeniden baslatiliyor...</p><script>setTimeout(function(){window.location.href='/';}, 5000);</script>");
            delay(1000);
            ESP.restart();
        } else {
            request->send(400, "text/plain", "Hata: Eksik bilgi.");
        }
    });

    // Captive Portal için Catch-All (Bilinmeyen istekleri anasayfaya yönlendir)
    server.onNotFound([](AsyncWebServerRequest *request) {
        request->send_P(200, "text/html", index_html);
    });

    // API: Canlı Veri Endpoint'i
    server.on("/api/data", HTTP_GET, [](AsyncWebServerRequest *request){
        std::map<String, VictronData> devices = victronScanner.getDevices();
        DynamicJsonDocument doc(4096);
        JsonArray arr = doc.to<JsonArray>();

        for (auto const& [mac, data] : devices) {
            // Son 60 saniye içinde güncel veri mi?
            if (millis() - data.timestamp > 60000) continue;

            JsonObject obj = arr.createNestedObject();
            obj["mac"] = mac;
            obj["type"] = (int)data.type;
            obj["voltage"] = data.voltage;
            obj["current"] = data.current;
            obj["rssi"] = -1; // RSSI şu an tutulmuyor, istenirse eklenebilir

            if (data.type == SOLAR_CHARGER) {
                obj["pv_power"] = data.pvPower;
                obj["load_current"] = data.loadCurrent;
                obj["state"] = data.deviceState;
            } else if (data.type == BATTERY_MONITOR) {
                obj["soc"] = data.soc;
                obj["consumed_ah"] = data.consumedAh;
                obj["remaining_mins"] = data.remainingMins;
            }
        }

        String jsonString;
        serializeJson(doc, jsonString);
        request->send(200, "application/json", jsonString);
    });
}
