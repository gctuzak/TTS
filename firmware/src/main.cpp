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

#define BOOT_BUTTON 0

// --- Global Nesneler ---
AsyncWebServer server(80);
DNSServer dnsServer;
VictronBLE victronScanner;
TFT_eSPI tft = TFT_eSPI();

// --- Değişkenler ---
unsigned long lastTelemeterySend = 0;
const long TELEMETRY_INTERVAL = 10000; 
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
    tft.setCursor(0, 0);
    tft.print("Victron BLE");

    // WiFi Status
    tft.setTextSize(1);
    tft.setTextDatum(TR_DATUM); // Sağ üst köşe hizalama
    int wifiStatusX = tft.width() - 2;
    
    if (WiFi.status() == WL_CONNECTED) {
        tft.setTextColor(TFT_GREEN, TFT_BLACK);
        tft.drawString("WIFI: BAGLI", wifiStatusX, 5, 1);
    } else if (isApMode) {
        tft.setTextColor(TFT_MAGENTA, TFT_BLACK);
        tft.drawString("MOD: SETUP", wifiStatusX, 5, 1);
    } else {
        tft.setTextColor(TFT_RED, TFT_BLACK);
        tft.drawString("WIFI: YOK", wifiStatusX, 5, 1);
    }
    tft.setTextDatum(TL_DATUM); // Sol üst köşe hizalamaya geri dön

    tft.drawLine(0, 22, tft.width(), 22, TFT_DARKGREY);

    if (batteryMonitorFound || mpptCount > 0) {
        int row1_y = 30;
        int row1_val_y = 45;
        int col2_x = 130;

        // Voltage
        tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        tft.setTextSize(1);
        tft.setCursor(0, row1_y);
        tft.print("AKU VOLTAJI");
        
        tft.setTextColor(TFT_WHITE, TFT_BLACK);
        tft.setTextSize(3);
        tft.setCursor(0, row1_val_y);
        if (batteryMonitorFound) tft.printf("%.2fV", mainBatteryVoltage);
        else tft.print("--.--V");

        // Current
        tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        tft.setTextSize(1);
        tft.setCursor(col2_x, row1_y);
        tft.print("AKIM");
        
        tft.setTextSize(3);
        tft.setCursor(col2_x, row1_val_y);
        if (batteryMonitorFound) {
             if (mainBatteryCurrent > 0) tft.setTextColor(TFT_GREEN, TFT_BLACK);
             else tft.setTextColor(TFT_RED, TFT_BLACK);
             tft.printf("%.1fA", mainBatteryCurrent);
        } else {
             tft.setTextColor(TFT_WHITE, TFT_BLACK);
             tft.print("--.-A");
        }

        // SOC
        int row2_y = 80;
        tft.setTextColor(TFT_YELLOW, TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(0, row2_y);
        if (batteryMonitorFound) tft.printf("SOC: %.1f%%", mainBatterySoc);
        else tft.print("SOC: --.-%");
        
        // SOC Bar
        int barY = 105;
        int barHeight = 15;
        int barWidth = tft.width() - 4;
        
        tft.drawRect(0, barY, barWidth, barHeight, TFT_WHITE);
        if (batteryMonitorFound) {
            int fillWidth = (int)((mainBatterySoc / 100.0) * (barWidth - 4));
            tft.fillRect(2, barY + 2, fillWidth, barHeight - 4, (mainBatterySoc > 50 ? TFT_GREEN : TFT_RED));
        }

        // Solar Info
        int row3_y = 130;
        if (mpptCount > 0) {
            tft.setTextColor(TFT_ORANGE, TFT_BLACK);
            tft.setTextSize(1); // Alan dar, küçülttük
            tft.setCursor(0, row3_y);
            tft.printf("PV: %.0fW (%d MPPT)", totalPvPower, mpptCount);
        }
        
        // TTG
        tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        tft.setTextSize(1);
        tft.setCursor(130, row3_y); // Solar'ın yanına veya altına
        if (batteryMonitorFound) {
             if (mainBatteryRemaining == 0xFFFF || mainBatteryRemaining == -1) {
                  tft.print("SURE: Sonsuz");
             } else {
                  tft.printf("SURE: %ddk", mainBatteryRemaining);
             }
        } else {
             tft.print("SURE: --");
        }

    } else {
        tft.setTextColor(TFT_ORANGE, TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(40, 80);
        tft.println("Veri Bekleniyor...");
        
        // --- DEBUG BILGISI ---
        if (victronScanner.lastSeenDevice.length() > 0) {
             tft.setTextSize(1);
             tft.setTextColor(TFT_YELLOW, TFT_BLACK);
             tft.setCursor(10, 165);
             tft.printf("Son: %s", victronScanner.lastSeenDevice.c_str());
        }
        
        if (victronScanner.lastError.length() > 0) {
             tft.setTextSize(1);
             tft.setTextColor(TFT_RED, TFT_BLACK);
             tft.setCursor(10, 180);
             tft.printf("Err: %s", victronScanner.lastError.c_str());
        }
        // ---------------------
        
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
  delay(3000); // Wait for serial monitor
  Serial.println("\n\n--- SISTEM BASLATILIYOR ---");
  
  // Boot Düğmesi Ayarı
  pinMode(BOOT_BUTTON, INPUT_PULLUP);

  setupDisplay();
  
  // NVS'den Ayarları Oku (ConfigManager)
  loadConfig();
  
  Serial.println("--- DEBUG: STARTUP CONFIG ---");
  Serial.println("SSID: " + config_ssid);
  Serial.println("DevicesJSON Length: " + String(config_devicesJson.length()));
  Serial.println("DevicesJSON Content: " + config_devicesJson);
  Serial.println("-----------------------------");

  // WiFi Bağlantısı Dene
    if (config_ssid != "") {
        Serial.println("WiFi Baglaniyor...");
        WiFi.disconnect(true);  // Eski baglantilari temizle
        delay(100);
        WiFi.mode(WIFI_STA);
        delay(100);
        
        // DNS Ayarlari - Google ve Cloudflare
        // 0.0.0.0 (INADDR_NONE) DHCP kullan demektir
        WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, IPAddress(8,8,8,8), IPAddress(1,1,1,1));
        
        WiFi.begin(config_ssid.c_str(), config_pass.c_str());
        
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 40) { // 20 saniye bekle
            delay(500);
            Serial.print(".");
            attempts++;
        }
        Serial.println();
        
        if (WiFi.status() == WL_CONNECTED) {
            Serial.print("WiFi Baglandi. IP: ");
            Serial.println(WiFi.localIP());
            Serial.print("Gateway: ");
            Serial.println(WiFi.gatewayIP());
            Serial.print("DNS: ");
            Serial.println(WiFi.dnsIP());
            Serial.print("RSSI: ");
            Serial.println(WiFi.RSSI());
            
            // DNS Testi
            IPAddress result;
            if(WiFi.hostByName("google.com", result)) {
                Serial.print("DNS Test Basarili (google.com): ");
                Serial.println(result);
            } else {
                Serial.println("DNS Testi Basarisiz!");
            }
            
            isApMode = false;
        } else {
            Serial.println("WiFi Baglanti Hatasi!");
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
      // dnsServer.start(53, "*", WiFi.softAPIP());
      // Serial.println("DNS Sunucusu Baslatildi (Captive Portal)");
      Serial.println("Captive Portal Devre Disi (Manuel IP: 192.168.4.1)");
  }

  // Web Sunucusunu Başlat (ConfigManager)
  setupWebServer();
  server.begin();

  // BLE Başlat (AP Modunda da çalışsın)
    // Kayıtlı cihazları JSON'dan yükle
    Serial.println("JSON Parse Ediliyor: " + config_devicesJson);
    DynamicJsonDocument devicesDoc(4096);
    DeserializationError error = deserializeJson(devicesDoc, config_devicesJson);
    
    if (!error) {
        JsonArray devices = devicesDoc.as<JsonArray>();
        Serial.printf("Kayitli %d cihaz yukleniyor...\n", devices.size());
        
        for (JsonObject d : devices) {
            String mac = d["mac"].as<String>();
            String key = d["key"].as<String>();
            
            Serial.printf("Cihaz Ekleme Deneniyor -> MAC: %s, Key: %s\n", mac.c_str(), key.c_str());
            
            if (mac.length() > 0 && key.length() > 0) {
                victronScanner.addDevice(mac, key);
            } else {
                Serial.println("HATA: MAC veya Key bos!");
            }
        }
    } else {
        Serial.printf("JSON Parse Hatasi: %s\n", error.c_str());
    }
    
    Serial.println("BLE Baslatiliyor... (1s bekleme)");
    delay(1000);
    victronScanner.begin();
    Serial.println("BLE Baslatildi.");
  
  // Ekrana Son Durumu Bas
  Serial.println("Setup bitti. Ilk ekran guncellemesi...");
  updateDisplay();
}

void sendTelemetry() {
    if (WiFi.status() != WL_CONNECTED) return;
    
    // DEBUG: DNS Kontrol
    Serial.print("Aktif DNS: ");
    Serial.println(WiFi.dnsIP());

    if (config_supabaseUrl == "" || config_secret == "") {
        Serial.println("HATA: Supabase URL veya Secret eksik!");
        return;
    }

    std::map<String, VictronData> devices = victronScanner.getDevices();
    if (devices.empty()) {
        Serial.println("Gonderilecek cihaz verisi yok.");
        return;
    }

    // JSON Oluştur (Edge Function Formatı: { measurements: [...] })
    DynamicJsonDocument doc(4096);
    JsonObject root = doc.to<JsonObject>();
    JsonArray measurements = root.createNestedArray("measurements");
    
    bool hasNewData = false;

    for (auto const& [mac, data] : devices) {
        // Sadece son 1 dakika içinde güncellenen verileri gönder
        if (millis() - data.timestamp > 60000) {
            Serial.printf("Atlanan eski veri: %s\n", mac.c_str());
            continue;
        }
        
        hasNewData = true;
        JsonObject m = measurements.createNestedObject();
        
        m["mac"] = mac; // Cihaz MAC adresi
        
        // Edge Function uyumlu alan isimleri
        m["v"] = data.voltage;
        m["i"] = data.current;
        m["t"] = data.temperature; // Sıcaklık eklendi
        m["a"] = data.alarm;       // Alarm durumu eklendi
        m["dt"] = (int)data.type;  // Device Type (1=Solar, 2=BMV)
        
        if (data.type == SOLAR_CHARGER) {
            m["p"] = data.pvPower;   // PV Power
            m["pv_v"] = data.pvVoltage;
            m["pv_i"] = data.pvCurrent;
            m["l_i"] = data.loadCurrent;
            m["l_s"] = data.loadState;
            m["d_s"] = data.deviceState;
            m["yt"] = data.yieldToday;  // Yield Today
            m["eff"] = data.efficiency; // Efficiency
        } else if (data.type == BATTERY_MONITOR) {
            m["soc"] = data.soc;
            m["c_ah"] = data.consumedAh;
            m["rem"] = data.remainingMins;
            m["aux"] = data.auxVoltage;
            m["p"] = data.power; // Net Power (W)
        }
        
        // Cihaz türünü ayırt etmek için opsiyonel
        // m["type"] = (int)data.type; 
    }

    if (!hasNewData) {
        Serial.println("Guncel veri bulunamadi, gonderim iptal.");
        return;
    }

    String jsonString;
    serializeJson(doc, jsonString);
    Serial.println("Gonderilen JSON: " + jsonString);

    // URL Oluştur (Edge Function)
    String url = config_supabaseUrl;
    if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
    url += "/functions/v1/telemetry";

    // HTTP POST Gönder
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Edge Function Auth Headers
    http.addHeader("x-boat-id", config_boatId);
    http.addHeader("x-device-secret", config_secret);
    
    // Supabase Auth (Anon Key gerekebilir)
    http.addHeader("Authorization", String("Bearer ") + config_secret);
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode >= 200 && httpResponseCode < 300) {
        Serial.printf("Telemetri Gonderildi: %d\n", httpResponseCode);
        Serial.println("Sunucu Cevabi: " + http.getString());
    } else {
        Serial.printf("Telemetri Hatasi: %d (WiFi IP: %s)\n", httpResponseCode, WiFi.localIP().toString().c_str());
        Serial.println("Sunucu Cevabi: " + http.getString());
    }
    
    http.end();
}

// Buton Zamanlayıcısı
unsigned long bootBtnTimer = 0;
bool bootBtnPressed = false;

void loop() {
  // Boot Butonu Kontrolü (5 sn basılı tutulursa resetle)
  if (digitalRead(BOOT_BUTTON) == LOW) {
      if (!bootBtnPressed) {
          bootBtnPressed = true;
          bootBtnTimer = millis();
      }
      
      if (millis() - bootBtnTimer > 5000) {
          tft.fillScreen(TFT_RED);
          tft.setTextColor(TFT_WHITE, TFT_RED);
          tft.setTextSize(2);
          tft.setCursor(10, 60);
          tft.println("AYARLAR");
          tft.setCursor(10, 90);
          tft.println("SIFIRLANIYOR...");
          
          Serial.println("Boot butonuna 5sn basildi. Resetleniyor...");
          resetConfig();
          delay(2000);
          ESP.restart();
      }
  } else {
      bootBtnPressed = false;
      bootBtnTimer = 0;
  }

  // Captive Portal DNS İsteklerini İşle
  if (isApMode) {
      dnsServer.processNextRequest();
  }
  
  // BLE güncelle (Her zaman)
  victronScanner.update();

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
