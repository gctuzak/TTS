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
String config_supabaseUrl = "https://tts-db.gergitavan.tr";
String config_secret = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDc5NjgyMCwiZXhwIjo0OTMwNDcwNDIwLCJyb2xlIjoiYW5vbiJ9.CK5wj0bZD5ZqDYEJXtbOEkEYtyeFuf4fgt46BtAVyWE";
String config_devicesJson = "[]";

// Ayarları Yükle
void loadConfig() {
    preferences.begin("victron-app", true); // Read-only mode = true
    config_ssid = preferences.getString("ssid", "");
    config_pass = preferences.getString("pass", "");
    
    
    // Varsayılan boatId oluştur (MyBoat-XXXX)
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    String defaultBoatId = "MyBoat-" + mac.substring(8); // Son 4 hane
    
    // Eğer kayıtlı bir isim yoksa varsayılanı kullan
    config_boatId = preferences.getString("boatId", defaultBoatId);
    
    // Güvenlik: Eğer hafızadan boş gelirse yine varsayılanı ata
    if (config_boatId.length() == 0) {
        config_boatId = defaultBoatId;
    }
    
    config_devicesJson = preferences.getString("devices", "[]");
    
    // Eğer devicesJson boşsa veya geçerli JSON değilse varsayılan ata
    if (config_devicesJson.length() < 2) config_devicesJson = "[]";
    
    preferences.end();
}

// Ayarları Kaydet
void saveConfig(String ssid, String pass, String boatId, String devicesJson) {
    preferences.begin("victron-app", false); // Read-write mode
    preferences.putString("ssid", ssid);
    preferences.putString("pass", pass);
    preferences.putString("boatId", boatId);
    preferences.putString("devices", devicesJson);
    preferences.end();
}

// Ayarları Sıfırla (WiFi Bilgilerini Sil)
void resetConfig() {
    preferences.begin("victron-app", false);
    preferences.remove("ssid");
    preferences.remove("pass");
    preferences.end();
    Serial.println("Ayarlar Sifirlandi!");
}

// Web Sunucusunu Başlat
void setupWebServer() {
    // Anasayfa
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send_P(200, "text/html", index_html);
    });

    // Form Gönderimi (POST)
    server.on("/save", HTTP_POST, [](AsyncWebServerRequest *request){
        String ssid = "", pass = "", boatId = "", devicesJson = "[]";

        if (request->hasParam("ssid", true)) ssid = request->getParam("ssid", true)->value();
        if (request->hasParam("pass", true)) pass = request->getParam("pass", true)->value();
        if (request->hasParam("boatId", true)) boatId = request->getParam("boatId", true)->value();
        if (request->hasParam("devices", true)) devicesJson = request->getParam("devices", true)->value();

        Serial.println("SAVE Request Received:");
        Serial.println("SSID: " + ssid);
        Serial.println("Devices: " + devicesJson);

        boatId.trim(); devicesJson.trim();
        ssid.trim(); pass.trim(); // Eklendi: Wifi isminin veya şifresinin başında/sonunda yanlışlıkla boşluk bırakılmışsa sil

        if (ssid.length() > 0 && boatId.length() > 0) {
            saveConfig(ssid, pass, boatId, devicesJson);
            request->send(200, "text/html", "<h1>Ayarlar Kaydedildi!</h1><p>Cihaz yeniden baslatiliyor...</p><script>setTimeout(function(){window.location.href='/';}, 5000);</script>");
            delay(1000);
            ESP.restart();
        } else {
            request->send(400, "text/plain", "Hata: Eksik bilgi.");
        }
    });

    // API: Kayıtlı Cihazları Getir (Ayarlar sayfası için)
    server.on("/api/config", HTTP_GET, [](AsyncWebServerRequest *request){
        DynamicJsonDocument doc(2048);
        doc["ssid"] = config_ssid;
        // Şifreyi gönderme (güvenlik)
        doc["boatId"] = config_boatId;
        
        DynamicJsonDocument devicesDoc(2048);
        DeserializationError error = deserializeJson(devicesDoc, config_devicesJson);
        
        if (!error) {
            doc["devices"] = devicesDoc.as<JsonArray>();
        } else {
            doc["devices"] = JsonArray(); // Boş dizi
        }

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    // API: Etraftaki WiFi Ağlarını Tara
    server.on("/api/wifi-scan", HTTP_GET, [](AsyncWebServerRequest *request){
        int n = WiFi.scanNetworks();
        DynamicJsonDocument doc(2048);
        JsonArray arr = doc.to<JsonArray>();
        
        for (int i = 0; i < n; ++i) {
            // Aynı isimdeki ağları (farklı frekans/MAC) tekrarlamamak için basit kontrol eklenebilir ama direkt basalım
            arr.add(WiFi.SSID(i));
        }
        
        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
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
                obj["yield_today"] = data.yieldToday;
            } else if (data.type == BATTERY_MONITOR) {
                obj["soc"] = data.soc;
                obj["consumed_ah"] = data.consumedAh;
                obj["remaining_mins"] = data.remainingMins;
                obj["power"] = data.power;
            }
        }

        String jsonString;
        serializeJson(doc, jsonString);
        request->send(200, "application/json", jsonString);
    });
}
