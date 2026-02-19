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
String lastWifiError = ""; // WiFi Hata Durumu

void setupDisplay() {
    // Backlight pinini manuel olarak açalım (LilyGo T-Display için GPIO 4)
    pinMode(4, OUTPUT);
    digitalWrite(4, HIGH);

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

const char* getMpptStateName(int state) {
    switch (state) {
        case 0: return "Off";
        case 2: return "Fault";
        case 3: return "Bulk";
        case 4: return "Absorption";
        case 5: return "Float";
        case 6: return "Storage";
        case 7: return "Equalize";
        case 245: return "Wake-up";
        case 252: return "Ext. Control";
        default: return "Unknown";
    }
}

void updateDisplay() {
    if (millis() - lastDisplayUpdate < 500) return;
    lastDisplayUpdate = millis();

    std::map<String, VictronData> devices = victronScanner.getDevices();
    
    // DEBUG: Cihaz listesi durumunu yazdır
    // Serial.printf("UpdateDisplay: Toplam %d cihaz hafızada.\n", devices.size());
    
    // Verileri Topla
    float totalPvPower = 0.0;
    float mainBatteryVoltage = 0.0;
    float mainBatteryCurrent = 0.0;
    float mainBatterySoc = 0.0;
    float mainBatteryConsumed = 0.0;
    int mainBatteryRemaining = 0;
    bool batteryMonitorFound = false;
    int mpptCount = 0;
    int mainMpptState = -1; // -1: Yok/Bilinmiyor
    
    for (auto const& [mac, data] : devices) {
        // Son 60 saniye içinde güncel veri mi? (Pasif tarama için süreyi uzattık)
        if (millis() - data.timestamp > 60000) {
            // Serial.printf("Cihaz %s verisi eski (gecen sure: %lu ms)\n", mac.c_str(), millis() - data.timestamp);
            continue;
        }
        
        // Serial.printf("Cihaz %s verisi guncel. Tip: %d\n", mac.c_str(), data.type);

        if (data.type == SOLAR_CHARGER) {
            totalPvPower += data.pvPower;
            if (mpptCount == 0) { // İlk MPPT'nin durumunu al
                mainMpptState = data.deviceState;
            }
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
        String ip = WiFi.localIP().toString();
        if (ip == "0.0.0.0") {
            tft.drawString("WIFI: BAGLI", wifiStatusX, 5, 1);
        } else {
            String label = "IP: " + ip;
            tft.drawString(label.c_str(), wifiStatusX, 5, 1);
        }
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
        int row2_y = 72;
        tft.setTextColor(TFT_YELLOW, TFT_BLACK);
        tft.setTextSize(2);
        tft.setCursor(0, row2_y);
        if (batteryMonitorFound) tft.printf("SOC: %.1f%%", mainBatterySoc);
        else tft.print("SOC: --.-%");
        
        // SOC Bar
        int barY = 96;
        int barHeight = 15;
        int barWidth = tft.width() - 4;
        
        tft.drawRect(0, barY, barWidth, barHeight, TFT_WHITE);
        if (batteryMonitorFound) {
            int fillWidth = (int)((mainBatterySoc / 100.0) * (barWidth - 4));
            tft.fillRect(2, barY + 2, fillWidth, barHeight - 4, (mainBatterySoc > 50 ? TFT_GREEN : TFT_RED));
        }

        // Solar Info
        int row3_y = 118;
        if (mpptCount > 0) {
            tft.setTextColor(TFT_ORANGE, TFT_BLACK);
            tft.setTextSize(1);
            tft.setCursor(0, row3_y);
            tft.printf("PV: %.0fW", totalPvPower);
            
            // MPPT State - Yanına veya Altına
            if (mainMpptState != -1) {
                 tft.printf(" (%s)", getMpptStateName(mainMpptState));
            }
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
             tft.println("Lutfen ayarlari yapin.");
             
             if (lastWifiError.length() > 0) {
                 tft.setTextColor(TFT_RED, TFT_BLACK);
                 tft.setCursor(20, 165);
                 tft.printf("Hata: %s", lastWifiError.c_str());
             }
        } else {
             tft.setTextSize(1);
             tft.setCursor(40, 120);
             tft.println("Victron cihazi araniyor...");
             tft.setCursor(40, 135);
             tft.println("Lutfen cihazi yaklastirin.");
        }
    }
}

const char* wifiReasonToString(uint8_t reason) {
    switch (reason) {
#ifdef WIFI_REASON_AUTH_EXPIRE
        case WIFI_REASON_AUTH_EXPIRE: return "AUTH_EXPIRE";
#endif
#ifdef WIFI_REASON_AUTH_FAIL
        case WIFI_REASON_AUTH_FAIL: return "AUTH_FAIL";
#endif
#ifdef WIFI_REASON_ASSOC_FAIL
        case WIFI_REASON_ASSOC_FAIL: return "ASSOC_FAIL";
#endif
#ifdef WIFI_REASON_HANDSHAKE_TIMEOUT
        case WIFI_REASON_HANDSHAKE_TIMEOUT: return "HANDSHAKE_TIMEOUT";
#endif
#ifdef WIFI_REASON_NO_AP_FOUND
        case WIFI_REASON_NO_AP_FOUND: return "NO_AP_FOUND";
#endif
#ifdef WIFI_REASON_BEACON_TIMEOUT
        case WIFI_REASON_BEACON_TIMEOUT: return "BEACON_TIMEOUT";
#endif
#ifdef WIFI_REASON_ASSOC_LEAVE
        case WIFI_REASON_ASSOC_LEAVE: return "ASSOC_LEAVE";
#endif
#ifdef WIFI_REASON_CONNECTION_FAIL
        case WIFI_REASON_CONNECTION_FAIL: return "CONNECTION_FAIL";
#endif
        case 2: return "AUTH_EXPIRE";
        case 15: return "HANDSHAKE_TIMEOUT";
        case 200: return "BEACON_TIMEOUT";
        case 201: return "NO_AP_FOUND";
        case 202: return "AUTH_FAIL";
        case 203: return "ASSOC_FAIL";
        case 204: return "HANDSHAKE_TIMEOUT";
        default: return "UNKNOWN";
    }
}

void WiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
    Serial.printf("[WiFi-event] event: %d\n", event);
    switch(event) {
    case SYSTEM_EVENT_STA_GOT_IP:
        Serial.println("WiFi Connected & Got IP");
        lastWifiError = ""; // Bağlanınca hatayı temizle
        break;
    case SYSTEM_EVENT_STA_DISCONNECTED:
        Serial.printf("WiFi Disconnected (reason: %d - %s)\n", info.wifi_sta_disconnected.reason, wifiReasonToString(info.wifi_sta_disconnected.reason));
        lastWifiError = String(wifiReasonToString(info.wifi_sta_disconnected.reason));
        break;
    case SYSTEM_EVENT_STA_START:
        Serial.println("WiFi Station Started");
        break;
    case SYSTEM_EVENT_STA_STOP:
        Serial.println("WiFi Station Stopped");
        break;
    default:
        break;
    }
}

void setup() {
  Serial.begin(115200);
  
  // WiFi Event Listener
  WiFi.onEvent(WiFiEvent);
  delay(3000); // Wait for serial monitor
  Serial.println("\n\n--- SISTEM BASLATILIYOR ---");
  
  // Boot Düğmesi Ayarı
  pinMode(BOOT_BUTTON, INPUT_PULLUP);

  setupDisplay();

  // BLE'yi Erken Başlat (WiFi Çakışmasını Önlemek İçin)
  // WiFi başlatılmadan önce BLE kaynaklarını rezerve ediyoruz
  victronScanner.init();
  
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
        
        // Ekranda Bilgi Göster
        tft.fillScreen(TFT_BLACK);
        tft.setCursor(10, 10);
        tft.setTextColor(TFT_WHITE);
        tft.setTextSize(2);
        tft.println("WiFi Baglaniyor");
        tft.setTextSize(1);
        tft.setCursor(10, 40);
        tft.printf("SSID: %s", config_ssid.c_str());
        
        WiFi.disconnect(true, true);  // Daha agresif temizlik
        delay(500);
        WiFi.mode(WIFI_STA);
        delay(100);
        WiFi.persistent(false);
        WiFi.setAutoReconnect(true);
        // WiFi.setSleep(false); // Bu satır kaldırıldı veya true yapıldı
        WiFi.setSleep(true); // Modem sleep mode enabled to coexist with BLE
        
        // WiFi Güç Ayarı
        WiFi.setTxPower(WIFI_POWER_17dBm); // Maksimum yerine biraz düşük (stabilite için)
        WiFi.setHostname("VictronMonitor");
        
        Serial.printf("SSID: %s, PASS: %s\n", config_ssid.c_str(), config_pass.c_str());
        
        int targetChannel = 0;
        Serial.println("Ag Taramasi Baslatiliyor...");
        int n = WiFi.scanNetworks();
        if (n > 0) {
            for (int i = 0; i < n; ++i) {
                if (WiFi.SSID(i) == config_ssid) {
                    targetChannel = WiFi.channel(i);
                    Serial.printf("HEDEF AG BULUNDU! Kanal: %d, RSSI: %d\n", targetChannel, WiFi.RSSI(i));
                    break;
                }
            }
        }

        if (targetChannel > 0) {
            Serial.printf("Hedef Kanal (%d) ile baglaniliyor...\n", targetChannel);
            WiFi.begin(config_ssid.c_str(), config_pass.c_str(), targetChannel);
        } else {
            Serial.println("Hedef ag taramada bulunamadi, normal baglanti deneniyor...");
            WiFi.begin(config_ssid.c_str(), config_pass.c_str());
        }
        
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 60) { // 30 saniye
            delay(500);
            Serial.print(".");
            tft.setCursor(10 + (attempts * 5), 60);
            tft.print(".");
            
            // Eğer 20 denemeden sonra hala bağlanmadıysa ve kanal kullanıyorsak, kanalsız dene
            if (attempts == 20 && targetChannel > 0) {
                Serial.println("\nKanal ile baglanti basarisiz, normal deneniyor...");
                WiFi.begin(config_ssid.c_str(), config_pass.c_str());
            }
            
            attempts++;
        }
        Serial.println();
        
        if (WiFi.status() == WL_CONNECTED) {
            Serial.print("WiFi Baglandi. IP: ");
            Serial.println(WiFi.localIP());
            isApMode = false;
        } else {
            Serial.printf("WiFi Baglanti Hatasi! Durum: %d\n", WiFi.status());
            isApMode = true;
            
            // BAĞLANTI HATASI DURUMUNDA AP MODUNA GEÇİŞİ ZORLA
            Serial.println("Baglanti kurulamadi, AP moduna geciliyor...");
            WiFi.disconnect(true, true);
            delay(500);
        }
    } else {
      Serial.println("Kayitli WiFi yok. AP Modu.");
      isApMode = true;
    }
  
  // Eğer bağlantı yoksa AP Modunu başlat
  if (isApMode) {
      Serial.println("AP Modu Baslatiliyor...");
      
      WiFi.persistent(false);
      WiFi.disconnect(true, true);
      delay(1000);
      
      WiFi.mode(WIFI_AP);
      delay(500);
      
      // AP Yapılandırması (IP adresi varsayılan 192.168.4.1 olsun)
      IPAddress apIP(192, 168, 4, 1);
      IPAddress gateway(192, 168, 4, 1);
      IPAddress subnet(255, 255, 255, 0);
      WiFi.softAPConfig(apIP, gateway, subnet);
      
      bool apResult = WiFi.softAP("VictronMonitor_Setup", "12345678", 6, 0, 4); // Kanal 6, gizli değil, max 4 bağlantı
      if (apResult) {
          Serial.println("AP Basariyla Baslatildi!");
          Serial.print("AP SSID: "); Serial.println("VictronMonitor_Setup");
          Serial.print("AP IP: "); Serial.println(WiFi.softAPIP());
      } else {
          Serial.println("AP BASLATILAMADI!");
      }
      
      delay(500);
      apTimeout = millis();
      
      // Captive Portal için DNS Sunucusunu Başlat
      dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
      dnsServer.start(53, "*", WiFi.softAPIP());
      Serial.println("DNS Sunucusu Baslatildi (Captive Portal)");
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
    
    if (!isApMode) {
        Serial.println("BLE Baslatiliyor... (1s bekleme)");
        delay(1000);
        victronScanner.begin();
        Serial.println("BLE Baslatildi.");
    } else {
        Serial.println("AP Modu aktif, BLE cakismayi onlemek icin baslatilmadi.");
    }
  
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

    // JSON Oluştur (RPC Formatı: { \"payload\": [ ... ] })
    DynamicJsonDocument doc(4096);
    JsonArray measurements = doc.createNestedArray("payload");
    
    bool hasNewData = false;

    for (auto const& [mac, data] : devices) {
        // Sadece son 1 dakika içinde güncellenen verileri gönder
        if (millis() - data.timestamp > 60000) {
            Serial.printf("Atlanan eski veri: %s\n", mac.c_str());
            continue;
        }
        
        hasNewData = true;
        JsonObject m = measurements.createNestedObject();
        
        m["mac_address"] = mac; // Cihaz MAC adresi
        m["boat_name"] = config_boatId; // Kullanıcının girdiği tekne adı
        
        // Supabase DB Column Names
        m["voltage"] = data.voltage;
        m["current"] = data.current;
        m["temperature"] = data.temperature; // Sıcaklık eklendi
        m["alarm"] = data.alarm;       // Alarm durumu eklendi
        m["device_type"] = (int)data.type;  // Device Type (1=Solar, 2=BMV)
        m["soc"] = data.soc;
        m["pv_power"] = data.pvPower;
        m["pv_voltage"] = data.pvVoltage;
        m["pv_current"] = data.pvCurrent;
        m["load_current"] = data.loadCurrent;
        m["device_state"] = data.deviceState;
        m["yield_today"] = data.yieldToday;
        m["efficiency"] = data.efficiency;
        m["consumed_ah"] = data.consumedAh;
        m["remaining_mins"] = data.remainingMins;
        m["aux_voltage"] = data.auxVoltage;
        m["charge_state"] = data.chargeStateDesc;
        
        m["load_state"] = data.loadState;
        
        // Power hesapla (Eğer yoksa)
        if (data.power == 0 && data.voltage > 0) {
             m["power"] = data.voltage * data.current;
        } else {
             m["power"] = data.power;
        }
        
        // Cihaz türünü ayırt etmek için opsiyonel
        // m["type"] = (int)data.type; 
    }

    if (!hasNewData) {
        Serial.println("Guncel veri bulunamadi, gonderim iptal.");
        return;
    }

    String payload;
    serializeJson(doc, payload);
    Serial.println("Gonderilen JSON: " + payload);

    // URL Oluştur (Supabase RPC)
    // Örnek: https://xxx.supabase.co/rest/v1/rpc/ingest_telemetry
    String url = config_supabaseUrl;
    if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
    url += "/rest/v1/rpc/ingest_telemetry";

    // HTTP POST Gönder
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Supabase REST API Headers
    http.addHeader("apikey", config_secret);
    http.addHeader("Authorization", String("Bearer ") + config_secret);
    
    // Supabase REST API insert için "Prefer: return=representation" diyebiliriz (cevap dönsün diye)
    http.addHeader("Prefer", "return=representation");
    
    int httpResponseCode = http.POST(payload);
    
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
  // BOOT_BUTTON genellikle GPIO 0'dır ve pull-up direnci vardır.
  // Basılınca LOW olur. Ancak bazı boardlarda farklı olabilir.
  // Debug için buton durumunu sürekli okuyalım.
  
  static unsigned long lastButtonDebug = 0;
  if (millis() - lastButtonDebug > 1000) {
      Serial.printf("DEBUG: Boot Button Status: %d\n", digitalRead(BOOT_BUTTON));
      lastButtonDebug = millis();
  }

  if (digitalRead(BOOT_BUTTON) == LOW) {
      if (!bootBtnPressed) {
          bootBtnPressed = true;
          bootBtnTimer = millis();
          Serial.println("Boot butonuna basildi...");
      } else {
          // Basılı tutuluyor
          unsigned long pressDuration = millis() - bootBtnTimer;
          
          // Ekrana geri sayım bas (Her 1 saniyede bir)
          if (pressDuration > 1000 && pressDuration % 1000 < 50) {
               Serial.printf("Basili Sure: %lu ms\n", pressDuration);
          }

          if (pressDuration > 5000) {
              tft.fillScreen(TFT_RED);
              tft.setTextColor(TFT_WHITE, TFT_RED);
              tft.setTextSize(2);
              tft.setCursor(10, 60);
              tft.println("AYARLAR");
              tft.setCursor(10, 90);
              tft.println("SIFIRLANIYOR...");
              
              Serial.println("Boot butonuna 5sn basildi. Sifirlaniyor...");
              resetConfig();
              delay(2000);
              ESP.restart();
          }
      }
  } else {
      if (bootBtnPressed) {
          Serial.println("Boot butonu birakildi.");
      }
      bootBtnPressed = false;
      bootBtnTimer = 0;
  }

  // Captive Portal DNS İsteklerini İşle
  if (isApMode) {
      dnsServer.processNextRequest();
  }

  if (isApMode && config_ssid.length() > 0) {
      if (WiFi.status() == WL_CONNECTED) {
          WiFi.softAPdisconnect(true);
          WiFi.mode(WIFI_STA);
          isApMode = false;
      } else if (millis() - apTimeout > 30000) {
          apTimeout = millis();
          WiFi.begin(config_ssid.c_str(), config_pass.c_str());
      }
  }
  
  // BLE güncelle (Her zaman)
  if (!isApMode) {
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
