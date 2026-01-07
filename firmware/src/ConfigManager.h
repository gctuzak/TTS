#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H

#include <Arduino.h>

// Global Ayar Değişkenleri
extern String config_ssid;
extern String config_pass;
extern String config_boatId;
extern String config_supabaseUrl;
extern String config_secret;
extern String config_victronKey;

void loadConfig();
void saveConfig(String ssid, String pass, String boatId, String victronKey);
void setupWebServer();

#endif
