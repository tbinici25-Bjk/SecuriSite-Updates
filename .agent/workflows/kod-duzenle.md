---
description: Site güvenlik bot kodlarında değişiklik yapmadan önce ve sonra çalıştırılacak adımlar
---

# Site Güvenlik - Kod Düzenleme Workflow

Bu projede kod dosyaları salt-okunur olarak korunmaktadır. Herhangi bir düzenleme yapmadan önce aşağıdaki adımları takip edin.

## Düzenleme Öncesi

1. Korumayı kaldır:
// turbo
```
cmd /c "C:\Users\tarik\.gemini\antigravity\scratch\site-guvenlik\koruma-kaldir.bat"
```

2. Gerekli düzenlemeleri yap

## Düzenleme Sonrası

3. Korumayı tekrar aç:
// turbo
```
cmd /c "C:\Users\tarik\.gemini\antigravity\scratch\site-guvenlik\koruma-ac.bat"
```

## Önemli Notlar
- Kod dosyaları: `server.js`, `whatsapp.js`, `database.js`, `package.json`, tüm `public/` dosyaları
- Yedekler: `C:\SiteGuvenlik-Yedek\` klasöründe (günlük otomatik, gece 03:00)
- Manuel yedek: `yedekle.bat` çift tıklayarak çalıştırılabilir
