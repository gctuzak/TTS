#include "VictronBLE.h"

VictronBLE::VictronBLE() {
}

void VictronBLE::hexStringToBytes(String hex, uint8_t* bytes) {
    for (unsigned int i = 0; i < hex.length(); i += 2) {
        String byteString = hex.substring(i, i + 2);
        bytes[i / 2] = (uint8_t)strtol(byteString.c_str(), NULL, 16);
    }
}

void VictronBLE::addDevice(String mac, String keyHex) {
    // Key'i temizle (Boşlukları ve görünmez karakterleri sil)
    keyHex.trim();
    keyHex.replace(" ", "");
    keyHex.replace("\t", "");
    keyHex.replace("\r", "");
    keyHex.replace("\n", "");
    
    if (keyHex.length() != 32) {
        Serial.printf("HATA: Victron Key 32 karakter olmali! Girilen: %d karakter (%s)\n", keyHex.length(), keyHex.c_str());
        return;
    }
    
    // MAC adresini normalize et (küçük harf, tire yerine iki nokta)
    mac.trim();
    mac.toLowerCase();
    mac.replace("-", ":");

    // Eğer : yoksa ve 12 karakterse, aralara : koy (aabbccddeeff -> aa:bb:cc:dd:ee:ff)
    if (mac.indexOf(':') == -1 && mac.length() == 12) {
        String formatted = "";
        for (int i = 0; i < 12; i += 2) {
            formatted += mac.substring(i, i + 2);
            if (i < 10) formatted += ":";
        }
        mac = formatted;
    }
    
    std::vector<uint8_t> keyBytes(16);
    hexStringToBytes(keyHex, keyBytes.data());
    
    deviceKeys[mac] = keyBytes;
    Serial.printf("Cihaz eklendi: %s (Key: %s)\n", mac.c_str(), keyHex.c_str());
}

void VictronBLE::begin() {
    Serial.printf("Free Heap before BLE init: %d\n", ESP.getFreeHeap());
    Serial.println("BLE: NimBLE init...");
    NimBLEDevice::init("");
    Serial.println("BLE: getScan...");
    pBLEScan = NimBLEDevice::getScan();
    Serial.println("BLE: setCallbacks...");
    pBLEScan->setAdvertisedDeviceCallbacks(this);
    Serial.println("BLE: setActiveScan...");
    pBLEScan->setActiveScan(false); // Passive scan is enough for Manufacturer Data
    Serial.println("BLE: setInterval...");
    pBLEScan->setInterval(100);
    Serial.println("BLE: setWindow...");
    pBLEScan->setWindow(50); // 50% duty cycle to allow WiFi to work
    Serial.println("BLE: begin finished.");
}

void VictronBLE::update() {
    if(!pBLEScan->isScanning()) {
        pBLEScan->start(5, false);
    }
}

bool VictronBLE::decryptData(String macAddress, const uint8_t* rawData, size_t len, uint8_t* decryptedBuffer) {
    macAddress.toLowerCase();
    
    if (deviceKeys.find(macAddress) == deviceKeys.end()) {
        Serial.printf("HATA: %s icin anahtar bulunamadi!\n", macAddress.c_str());
        lastError = "Key Yok: " + macAddress;
        return false;
    }
    
    const uint8_t* key = deviceKeys[macAddress].data();

    // Header 8 byte olmalı: 0x10, Len, ModelL, ModelH, Type, IV_L, IV_H, KeyCheck
    if (len < 10) return false; 
    if (rawData[0] != 0x10) return false;

    // Key Check (Byte 7) - Anahtarın ilk byte'ı ile eşleşmeli
    if (rawData[7] != key[0]) {
        Serial.printf("Key Check Hatasi: %02X != %02X\n", rawData[7], key[0]);
        lastError = "Key Check Fail";
        return false;
    }

    // Victron Nonce Yapısı (AES-CTR)
    // Fabian-Schmidt ve Victron dökümanlarına göre Nonce sadece Data Counter (IV) içerir.
    // İlk 2 byte Data Counter, gerisi 0.
    uint8_t nonce[16] = {0};
    nonce[0] = rawData[5]; // IV LSB (Data Counter L)
    nonce[1] = rawData[6]; // IV MSB (Data Counter H)
    // Kalanlar 0

    size_t encryptedLen = len - 8;
    const uint8_t* encryptedPtr = &rawData[8];

    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    
    int ret = mbedtls_aes_setkey_enc(&aes, key, 128);
    if (ret != 0) return false;

    size_t nc_off = 0;
    uint8_t stream_block[16] = {0};
    
    ret = mbedtls_aes_crypt_ctr(&aes, encryptedLen, &nc_off, nonce, stream_block, encryptedPtr, decryptedBuffer);
    
    mbedtls_aes_free(&aes);
    
    return (ret == 0);
}

void VictronBLE::parseDecryptedData(const uint8_t* data, size_t len, VictronData& result, uint8_t readoutType) {
    // Little Endian Helper
    auto getU16 = [&](int idx) -> uint16_t { return data[idx] | (data[idx+1] << 8); };
    auto getS16 = [&](int idx) -> int16_t { return data[idx] | (data[idx+1] << 8); };
    auto getU24 = [&](int idx) -> uint32_t { return data[idx] | (data[idx+1] << 8) | (data[idx+2] << 16); };
    
    result.timestamp = millis();
    result.valid = true;

    // DEBUG: Decrypted Data'yı bas
    Serial.printf("Decrypted (%d byte, Type %02X): ", len, readoutType);
    for(size_t i=0; i<len; i++) Serial.printf("%02X ", data[i]);
    Serial.println();

    if (readoutType == 0x01) {
        // --- SOLAR CHARGER (MPPT) ---
        result.type = SOLAR_CHARGER;
        // 0: State (u8)
        result.deviceState = data[0];
        // 1: Error (u8)
        result.alarm = data[1];
        // 2-3: Battery Voltage (s16, 0.01V)
        result.voltage = (float)getS16(2) / 100.0;
        // 4-5: Battery Current (s16, 0.1A)
        result.current = (float)getS16(4) / 10.0;
        // 6-7: Yield Today (u16, 0.01 kWh -> 10Wh)
        // Repo: vic_16bit_0_01_positive
        result.yieldToday = (float)getU16(6) * 0.01;
        
        // 8-9: PV Power (u16, 1W)
        result.pvPower = (float)getU16(8);
        
        // Verim Hesabı: (Battery Power / PV Power) * 100
        // Battery Power = Voltage * Current (Output)
        float batteryPower = result.voltage * result.current;
        if (result.pvPower > 0) {
            result.efficiency = (batteryPower / result.pvPower) * 100.0;
            if (result.efficiency > 100.0) result.efficiency = 100.0; // Limit
            if (result.efficiency < 0.0) result.efficiency = 0.0;
        } else {
            result.efficiency = 0.0;
        }

        // 10-11: Load Current (9 bits, 0.1A)
        // Repo: vic_9bit_0_1_negative load_current : 9;
        uint16_t load_raw = getU16(10);
        result.loadCurrent = (float)(load_raw & 0x1FF) / 10.0;
        
        // Bit 9: Load State (1=On, 0=Off) - Tahmini
        result.loadState = (load_raw & 0x200) ? 1 : 0;

        // PV Voltage/Current: BLE Advertisement paketinde bulunmuyor.
        // Ancak 0W ise 0 kabul edebiliriz.
        if (result.pvPower == 0) {
            result.pvVoltage = 0.0;
            result.pvCurrent = 0.0;
        } else {
            // Eğer güç varsa ama voltaj bilinmiyorsa, hesaplanamaz.
            // Şimdilik 0 bırakıyoruz, frontend'de "--" gösterilebilir.
        }

    } else if (readoutType == 0x02) {
        // --- BATTERY MONITOR (SmartShunt / BMV) ---
        result.type = BATTERY_MONITOR;
        
        // 0-1: Time To Go (u16 minutes)
        uint16_t ttg = getU16(0);
        result.remainingMins = (ttg == 0xFFFF) ? -1 : ttg;
        
        // 2-3: Voltage (s16, 0.01V)
        result.voltage = (float)getS16(2) / 100.0;
        
        // 4-5: Alarm (u16)
        result.alarm = getU16(4);

        // 6-7: Aux Voltage (u16, 0.01V) - Starter Battery
        result.auxVoltage = (float)getS16(6) / 100.0; 

        // --- BITFIELDS PARSING (Bytes 8-14) ---
        // Reference: struct VICTRON_BLE_RECORD_BATTERY_MONITOR
        
        // Bytes 8, 9, 10 contain:
        // - aux_input_type : 2 bits (LSB of Byte 8)
        // - battery_current : 22 bits
        uint32_t raw_current_chunk = data[8] | (data[9] << 8) | (data[10] << 16);
        
        // Extract Current (Shift right 2 bits, mask 22 bits)
        int32_t current_val = (raw_current_chunk >> 2) & 0x3FFFFF;
        // Sign extension for 22-bit integer
        if (current_val & 0x200000) {
            current_val |= 0xFFC00000;
        }
        result.current = (float)current_val / 1000.0; // 0.001A resolution
        
        // Bytes 11, 12, 13 contain:
        // - consumed_ah : 20 bits (Starts at Byte 11)
        uint32_t raw_ah_chunk = data[11] | (data[12] << 8) | (data[13] << 16);
        uint32_t ah_val = raw_ah_chunk & 0xFFFFF; // Mask 20 bits
        
        // Repo: vic_20bit_0_1_negative (Consumed Ah = -Record value)
        // It seems the value transmitted is positive magnitude, but represents consumption.
        // If we follow standard Victron logic, Consumed Ah is usually negative or zero.
        // Let's store it as negative as per repo hint.
        if (ah_val == 0xFFFFF) {
             // Unknown/Unset?
             result.consumedAh = 0.0;
        } else {
             result.consumedAh = -1.0 * (float)ah_val / 10.0; // 0.1Ah resolution
        }

        // Bytes 13, 14 contain:
        // - state_of_charge : 10 bits (Starts at Bit 4 of Byte 13)
        // We need Byte 13 and Byte 14.
        uint16_t raw_soc_chunk = data[13] | (data[14] << 8);
        uint16_t soc_val = (raw_soc_chunk >> 4) & 0x3FF; // Shift right 4, mask 10 bits
        
        // 0.1% resolution, range 0..1000 (100.0%)
        if (soc_val > 1000) {
            result.soc = 100.0; // Or indicate error
        } else {
            result.soc = (float)soc_val / 10.0;
        }
        
        result.power = result.voltage * result.current;
        
        // Debug
        Serial.printf("Parsed BMV: V=%.2f I=%.3f Ah=%.1f SOC=%.1f\n", 
            result.voltage, result.current, result.consumedAh, result.soc);

    } else {
        result.type = UNKNOWN;
    }
}

void VictronBLE::onResult(NimBLEAdvertisedDevice* advertisedDevice) {
    // Sadece Manufacturer Data olan cihazlarla ilgileniyoruz
    if (!advertisedDevice->haveManufacturerData()) return;

    std::string manuData = advertisedDevice->getManufacturerData();
    
    // Veri çok kısaysa yoksay
    if (manuData.length() < 4) return;

    uint8_t* data = (uint8_t*)manuData.data();

    // Victron ID kontrolü: 0x02E1 (Little Endian -> E1 02)
    // Ancak bazı durumlarda ID başta olmayabilir veya farklı olabilir.
    // Debug için gördüğümüz tüm Manufacturer Data ID'lerini yazdıralım (kısa süreliğine)
    // Serial.printf("BLE Device: %s, ManuID: %02X%02X\n", advertisedDevice->getAddress().toString().c_str(), data[0], data[1]);

    if (data[0] != 0xE1 || data[1] != 0x02) return;
    
    String mac = advertisedDevice->getAddress().toString().c_str();
    lastSeenDevice = mac; // Son gorulen cihazi kaydet
    Serial.printf("Victron Cihazi Bulundu: %s\n", mac.c_str());

    const uint8_t* victronPayload = &data[2];
    size_t victronLen = manuData.length() - 2;
    
    // Header Kontrol (0x10 = Victron BLE Protocol)
    if (victronPayload[0] != 0x10) {
        Serial.printf("Gecersiz Header (%s): %02X\n", mac.c_str(), victronPayload[0]);
        return;
    }

    uint8_t decrypted[32] = {0};
    
    if (decryptData(mac, victronPayload, victronLen, decrypted)) {
        Serial.printf("Sifre Cozme BASARILI: %s\n", mac.c_str());
        
        // Mevcut kaydı al veya yeni oluştur
        VictronData& devData = devices[mac];
        devData.macAddress = mac;
        
        // Model ID ve Readout Type (Offset düzeltmesi: +1 kaydı)
        // 0: 0x10, 1: Len, 2: ModelL, 3: ModelH, 4: Type
        uint16_t modelId = victronPayload[2] | (victronPayload[3] << 8);
        uint8_t readoutType = victronPayload[4];

        // Veriyi işle (Header 8 byte olduğu için len - 8)
        parseDecryptedData(decrypted, victronLen - 8, devData, readoutType);
    } else {
        // Şifre çözme başarısızsa nedenini anlamak için log
        // Serial.printf("Sifre Cozme BASARISIZ: %s (Anahtar tanimli mi?)\n", mac.c_str());
    }
}

void VictronBLE::simulate() {
    // 1. MPPT - Solar Charger 1
    String mac1 = "AA:BB:CC:DD:EE:01";
    VictronData& dev1 = devices[mac1];
    dev1.macAddress = mac1;
    dev1.type = SOLAR_CHARGER;
    dev1.valid = true;
    dev1.timestamp = millis();
    dev1.voltage = 13.5 + (random(-10, 10) / 100.0);
    dev1.current = 10.0 + (random(-5, 5) / 10.0);
    dev1.pvPower = 150.0 + random(-10, 20);
    dev1.deviceState = 3; // Bulk
    dev1.loadCurrent = 0;

    // 2. MPPT - Solar Charger 2
    String mac2 = "AA:BB:CC:DD:EE:02";
    VictronData& dev2 = devices[mac2];
    dev2.macAddress = mac2;
    dev2.type = SOLAR_CHARGER;
    dev2.valid = true;
    dev2.timestamp = millis();
    dev2.voltage = 13.5 + (random(-10, 10) / 100.0);
    dev2.current = 8.0 + (random(-5, 5) / 10.0);
    dev2.pvPower = 120.0 + random(-10, 20);
    dev2.deviceState = 3; // Bulk
    dev2.loadCurrent = 0;

    // 3. SmartShunt - Battery Monitor
    String mac3 = "AA:BB:CC:DD:EE:03";
    VictronData& dev3 = devices[mac3];
    dev3.macAddress = mac3;
    dev3.type = BATTERY_MONITOR;
    dev3.valid = true;
    dev3.timestamp = millis();
    dev3.voltage = 12.8 + (random(-5, 5) / 100.0);
    dev3.current = -5.2 + (random(-1, 1) / 10.0);
    dev3.power = dev3.voltage * dev3.current;
    dev3.soc = 85.5 + (random(-1, 1) / 10.0);
    dev3.consumedAh = -20.0;
    dev3.remainingMins = 1200;
}
