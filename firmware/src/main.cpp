#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ESPAsyncWebServer.h>
#include <NimBLEDevice.h>
#include <TFT_eSPI.h>
#include <SPI.h>
#include <map>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include "VictronBLE.h"
#include "ConfigManager.h"


// --- Global Nesneler ---
AsyncWebServer server(80);
DNSServer dnsServer;
VictronBLE victronScanner;
TFT_eSPI tft = TFT_eSPI();

// --- Değişkenler ---
unsigned long lastTelemeterySend = 0;
const long TELEMETRY_INTERVAL = 60000; 
unsigned long lastDisplayUpdate = 0;
unsigned long apTimeout = 0;
bool isApMode = false;

void setupDisplay() {
    tft.init();
    tft.setRotation(1); // Yatay Mod
    tft.fillScreen(TFT_BLACK);
    
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(10, 10);
    tft.println("Victron Monitor");
    
    tft.setTextSize(1);
    tft.setCursor(10, 40);
    tft.println("Sistem Baslatiliyor...");
}

void updateDisplay() {
    if (millis() - lastDisplayUpdate < 500) return;
    lastDisplayUpdate = millis();

    std::map<String, VictronData> devices = victronScanner.getDevices();
    
    // DEBUG: Cihaz listesi durumunu yazdır
    Serial.printf("UpdateDisplay: Toplam %d cihaz hafızada.\n", devices.size());
    
    // Verileri Topla
    float totalPvPower = 0.0;
    float mainBatteryVoltage = 0.0;
    float mainBatteryCurrent = 0.0;
    float mainBatterySoc = 0.0;
    float mainBatteryConsumed = 0.0;
    int mainBatteryRemaining = 0;
    bool batteryMonitorFound = false;
    int mpptCount = 0;
    
    for (auto const& [mac, data] : devices) {
        // Son 60 saniye içinde güncel veri mi? (Pasif tarama için süreyi uzattık)
        if (millis() - data.timestamp > 60000) {
            Serial.printf("Cihaz %s verisi eski (gecen sure: %lu ms)\n", mac.c_str(), millis() - data.timestamp);
            continue;
        }
        
        Serial.printf("Cihaz %s verisi guncel. Tip: %d\n", mac.c_str(), data.type);

        if (data.type == SOLAR_CHARGER) {
            totalPvPower += data.pvPower;
            mpptCount++;
        } else if (data.type == BATTERY_MONITOR) {
            // Birden fazla BMV varsa ilkini al veya mantık ekle
            if (!batteryMonitorFound) {
                mainBatteryVoltage = data.voltage;
                mainBatteryCurrent = data.current;
                mainBatterySoc = data.soc;
                mainBatteryConsumed = data.consumedAh;
                mainBatteryRemaining = data.remainingMins;
                batteryMonitorFound = true;
            }
        }
    }

    tft.fillScreen(TFT_BLACK); 

    // Header
    tft.setTextColor(TFT_CYAN, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(5, 5);
    tft.print("Victron BLE");

    // WiFi Status
    tft.setTextSize(1);
    tft.setCursor(200, 10);
    if (WiFi.status() == WL_CONNECTED) {
        tft.setTextColor(TFT_GREEN, TFT_BLACK);
        tft.print("WIFI: BAGLI");
    } else if (isApMode) {
        tft.setTextColor(TFT_MAGENTA, TFT_BLACK);
        tft.print("MOD: SETUP");
    } else {
        tft.setTextColor(TFT_RED, TFT_BLACK);
        tft.print("WIFI: YOK");
    }

    tft.drawLine(0, 30, 320, 30, TFT_DARKGREY);

    if (batteryMonitorFound || mpptCount > 0) {
        // Voltage
        tft.setTextColor(TFT_WHITE, TFT_BLACK);
        tft.setTextSize(1);
        tft.setCursor(10, 40);
        tft.print("AKU VOLTAJI");
        
        tft.setTextSize(3);
        tft.setCursor(10, 55);
        if (batteryMonitorFound) tft.printf("%.2f V", mainBatteryVoltage);
        else tft.print("--.-- V");

        // Current
        tft.setTextColor(TFT_WHITE, TFT_BLACK);
        tft.setTextSize(1);
        tft.setCursor(170, 40);
        tft.print("AKIM");
        
        tft.setTextSize(3);
        tft.setCursor(170, 55);
        if (batteryMonitorFound) {
             if (mainBatteryCurrent > 0) tft.setTextColor(TFT_GREEN, TFT_BLACK);
             else tft.setTextColor(TFT_RED, TFT_BLACK);
             tft.printf("%.1f A", mainBatteryCurrent);
        } else {
             tft.print("--.- A");
        }

        // SOC
        tft.setTextColor(TFT_YELLOW, TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(10, 100);
        if (batteryMonitorFound) tft.printf("SOC: %.1f %%", mainBatterySoc);
        else tft.print("SOC: --.- %");
        
        // SOC Bar
        int barWidth = 300;
        int barHeight = 20;
        int fillWidth = batteryMonitorFound ? (int)((mainBatterySoc / 100.0) * barWidth) : 0;
        tft.drawRect(10, 125, barWidth, barHeight, TFT_WHITE);
        tft.fillRect(12, 127, fillWidth-4, barHeight-4, (mainBatterySoc > 50 ? TFT_GREEN : TFT_RED));

        // Solar Info (New!)
        tft.setTextColor(TFT_ORANGE, TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(10, 155);
        tft.printf("PV: %.0f W (%d MPPT)", totalPvPower, mpptCount);
        
        // TTG
        tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        tft.setTextSize(1);
        tft.setCursor(10, 180);
        if (batteryMonitorFound) {
             if (mainBatteryRemaining == 0xFFFF || mainBatteryRemaining == -1) {
                  tft.print("SURE: Sonsuz");
             } else {
                  tft.printf("SURE: %d dk", mainBatteryRemaining);
             }
        } else {
             tft.print("SURE: --");
        }

    } else {
        tft.setTextColor(TFT_ORANGE, TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(40, 80);
        tft.println("Veri Bekleniyor...");
        
        if (isApMode) {
             tft.setTextSize(1);
             tft.setCursor(20, 120);
             tft.println("WiFi: VictronMonitor_Setup");
             tft.setCursor(20, 135);
             tft.print("IP: "); tft.println(WiFi.softAPIP());
             tft.setCursor(20, 150);
             tft.println("Lutfen tarayicidan ayarlari yapin.");
        } else {
             tft.setTextSize(1);
             tft.setCursor(40, 120);
             tft.println("Victron cihazi araniyor...");
             tft.setCursor(40, 135);
             tft.println("Lutfen cihazi yaklastirin.");
        }
    }
}

void setup() {
  Serial.begin(115200);
  setupDisplay();
  
  // NVS'den Ayarları Oku (ConfigManager)
  loadConfig();
  
  // WiFi Güç Tasarrufunu Kapat (Bağlantı kararlılığı için önemli)
  // WiFi.setSleep(false);

  Serial.println("Ayarlar Okundu:");
  Serial.println("SSID: " + config_ssid);
  Serial.println("Key: " + config_victronKey);

  // WiFi Bağlantısı Dene
  if (config_ssid != "") {
      Serial.println("WiFi Baglaniyor...");
      WiFi.mode(WIFI_STA);
      WiFi.begin(config_ssid.c_str(), config_pass.c_str());
      
      // 10 saniye bekle
      int retry = 0;
      while (WiFi.status() != WL_CONNECTED && retry < 20) {
          delay(500);
          Serial.print(".");
          retry++;
      }
      
      if (WiFi.status() == WL_CONNECTED) {
          Serial.println("\nWiFi Baglandi!");
          Serial.println(WiFi.localIP());
          isApMode = false;
      } else {
          Serial.println("\nWiFi Baglantisi Basarisiz. AP Moduna geciliyor.");
          isApMode = true;
      }
  } else {
      Serial.println("Kayitli WiFi yok. AP Modu.");
      isApMode = true;
  }
  
  // Eğer bağlantı yoksa AP Modunu başlat
  if (isApMode) {
      Serial.println("AP Modu Baslatiliyor...");
      // Önceki bağlantıları temizle
      WiFi.disconnect(true); 
      delay(100);
      
      WiFi.mode(WIFI_AP);
      // Kanal 1 yerine 6 veya 11 deneyebiliriz, şimdilik varsayılan (1) kalsın ama explicit olsun
      WiFi.softAP("VictronMonitor_Setup", "12345678"); 
      delay(500); // AP'nin oturması için bekle
      
      Serial.print("AP IP: ");
      Serial.println(WiFi.softAPIP());
      
      // Captive Portal için DNS Sunucusunu Başlat
      // Tüm alan adlarını (*) kendi IP'mize yönlendir
      dnsServer.start(53, "*", WiFi.softAPIP());
      Serial.println("DNS Sunucusu Baslatildi (Captive Portal)");
  }

  // Web Sunucusunu Başlat (ConfigManager)
  setupWebServer();
  server.begin();

  // BLE Başlat (Sadece WiFi Station modundaysa veya WiFi kapalıysa)
  // AP Modunda BLE taraması WiFi performansını düşürebilir.
  if (!isApMode) {
      // TEST İÇİN SABİT KEY: 0102030405060708090a0b0c0d0e0f10
      if (config_victronKey == "") {
          config_victronKey = "0102030405060708090a0b0c0d0e0f10";
          Serial.println("Test icin varsayilan Key atandi.");
      }
      victronScanner.setKey(config_victronKey);
      Serial.println("BLE Baslatiliyor... (1s bekleme)");
      delay(1000);
      victronScanner.begin();
      Serial.println("BLE Baslatildi.");
  } else {
      Serial.println("AP Modunda BLE Taramasi Devre Disi (WiFi Performansi Icin)");
  }
  
  // Ekrana Son Durumu Bas
  Serial.println("Setup bitti. Ilk ekran guncellemesi...");
  updateDisplay();
}

void sendTelemetry() {
    if (WiFi.status() != WL_CONNECTED) return;
    if (config_supabaseUrl == "" || config_secret == "") return;

    std::map<String, VictronData> devices = victronScanner.getDevices();
    if (devices.empty()) return;

    // JSON Oluştur (PostgREST Array formatında)
    DynamicJsonDocument doc(4096);
    
    bool hasNewData = false;

    for (auto const& [mac, data] : devices) {
        // Sadece son 1 dakika içinde güncellenen verileri gönder
        if (millis() - data.timestamp > 60000) continue;
        
        hasNewData = true;
        JsonObject deviceObj = doc.createNestedObject();
        
        // Veritabanı sütun isimleri
        deviceObj["boat_id"] = config_boatId;
        deviceObj["device_mac"] = mac;
        deviceObj["device_type"] = (int)data.type;
        deviceObj["voltage"] = data.voltage;
        deviceObj["current"] = data.current;
        
        if (data.type == SOLAR_CHARGER) {
            deviceObj["pv_power"] = data.pvPower;
            deviceObj["load_current"] = data.loadCurrent;
            deviceObj["device_state"] = data.deviceState;
        } else if (data.type == BATTERY_MONITOR) {
            deviceObj["soc"] = data.soc;
            deviceObj["consumed_ah"] = data.consumedAh;
            deviceObj["remaining_mins"] = data.remainingMins;
        }
    }

    if (!hasNewData) return;

    String jsonString;
    serializeJson(doc, jsonString);

    // URL Oluştur
    String url = config_supabaseUrl;
    if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
    url += "/rest/v1/telemetry";

    // HTTP POST Gönder
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", config_secret);
    http.addHeader("Authorization", String("Bearer ") + config_secret);
    http.addHeader("Prefer", "return=minimal");
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode >= 200 && httpResponseCode < 300) {
        Serial.printf("Telemetri Gonderildi: %d\n", httpResponseCode);
    } else {
        Serial.printf("Telemetri Hatasi: %d\n", httpResponseCode);
        // Serial.println(http.getString()); // Detay gerekirse açılabilir
    }
    
    http.end();
}

void loop() {
  // Captive Portal DNS İsteklerini İşle
  if (isApMode) {
      dnsServer.processNextRequest();
  } else {
      // Sadece AP modunda değilken BLE güncelle
      victronScanner.update();
  }

  // Ekranı Güncelle
  updateDisplay();

  // Telemetri Gönderimi (Sadece WiFi bağlıysa)
  if (millis() - lastTelemeterySend > TELEMETRY_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("Veri Buluta Gonderiliyor...");
        sendTelemetry();
    }
    lastTelemeterySend = millis();
  }
  
  delay(10);
}
