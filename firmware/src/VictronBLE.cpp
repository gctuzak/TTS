#include "VictronBLE.h"

VictronBLE::VictronBLE() {
}

void VictronBLE::hexStringToBytes(String hex, uint8_t* bytes) {
    for (unsigned int i = 0; i < hex.length(); i += 2) {
        String byteString = hex.substring(i, i + 2);
        bytes[i / 2] = (uint8_t)strtol(byteString.c_str(), NULL, 16);
    }
}

void VictronBLE::setKey(String keyHex) {
    if (keyHex.length() == 32) {
        hexStringToBytes(keyHex, aesKey);
        keySet = true;
        Serial.println("Victron AES Key Ayarlandi.");
    } else {
        Serial.println("HATA: Victron Key 32 karakter olmali!");
        keySet = false;
    }
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

bool VictronBLE::decryptData(const uint8_t* rawData, size_t len, uint8_t* decryptedBuffer, uint16_t deviceId) {
    if (!keySet) return false;
    if (len < 10) return false;
    if (rawData[0] != 0x10) return false;

    // Victron Nonce Yapısı (AES-CTR)
    uint8_t nonce[16] = {0};
    nonce[0] = rawData[1]; // Model ID L
    nonce[1] = rawData[2]; // Model ID H
    nonce[2] = rawData[3]; // Readout Type
    nonce[3] = rawData[4]; // IV LSB
    nonce[4] = rawData[5]; // IV MSB
    // Kalanlar 0

    size_t encryptedLen = len - 6;
    const uint8_t* encryptedPtr = &rawData[6];

    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    
    int ret = mbedtls_aes_setkey_enc(&aes, aesKey, 128);
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
        // 6-7: Yield Today (u16, 10Wh) -> Şimdilik kullanmıyoruz
        // 8-9: PV Power (u16, 1W)
        result.pvPower = (float)getU16(8);
        // 10-11: Load Current (u16, 0.1A)
        result.loadCurrent = (float)getU16(10) / 10.0;

    } else if (readoutType == 0x02) {
        // --- BATTERY MONITOR (SmartShunt / BMV) ---
        result.type = BATTERY_MONITOR;
        
        // 0-1: Time To Go
        uint16_t ttg = getU16(0);
        result.remainingMins = (ttg == 0xFFFF) ? -1 : ttg;
        
        // 2-3: Voltage (0.01V)
        result.voltage = (float)getS16(2) / 100.0;
        
        // 4-5: Alarm
        result.alarm = getU16(4);

        // 6-7: Aux Voltage

        // 8-10: Current (s24, 0.001A)
        int32_t current_raw = data[8] | (data[9] << 8) | (data[10] << 16);
        if (current_raw & 0x800000) current_raw |= 0xFF000000;
        result.current = (float)current_raw / 1000.0;
        
        // 11-12: Consumed Ah (0.1Ah)
        result.consumedAh = (float)getS16(11) / 10.0;
        
        // 13-14: SOC (0.1%)
        uint16_t soc_raw = getU16(13);
        result.soc = (float)(soc_raw & 0x3FFF) / 10.0;
        
        result.power = result.voltage * result.current;
    } else {
        result.type = UNKNOWN;
    }
}

void VictronBLE::onResult(NimBLEAdvertisedDevice* advertisedDevice) {
    if (!advertisedDevice->haveManufacturerData()) return;

    std::string manuData = advertisedDevice->getManufacturerData();
    
    if (manuData.length() < 4) return;

    // Victron ID: 0x02E1
    uint8_t* data = (uint8_t*)manuData.data();
    if (data[0] != 0xE1 || data[1] != 0x02) return;
    
    Serial.printf("Victron Device Found: %s\n", advertisedDevice->getAddress().toString().c_str());

    const uint8_t* victronPayload = &data[2];
    size_t victronLen = manuData.length() - 2;
    
    // Header Kontrol
    if (victronPayload[0] != 0x10) {
        Serial.printf("Invalid Header: %02X\n", victronPayload[0]);
        return;
    }

    uint16_t modelId = victronPayload[1] | (victronPayload[2] << 8);
    uint8_t readoutType = victronPayload[3];

    uint8_t decrypted[32] = {0};
    
    if (decryptData(victronPayload, victronLen, decrypted, modelId)) {
        Serial.println("Decryption SUCCESS!");
        String mac = advertisedDevice->getAddress().toString().c_str();
        
        // Mevcut kaydı al veya yeni oluştur
        VictronData& devData = devices[mac];
        devData.macAddress = mac;
        
        // Veriyi işle
        parseDecryptedData(decrypted, victronLen - 6, devData, readoutType);
    } else {
        Serial.println("Decryption FAILED!");
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
