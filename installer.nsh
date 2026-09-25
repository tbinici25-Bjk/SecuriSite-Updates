; NSIS installer custom script for Site Güvenlik
; Bu dosya electron-builder tarafından kullanılır

!macro customInit
  ; İlk kurulum — Node.js setup kontrolü
!macroend

!macro customInstall
  ; Kurulum sonrası setup.js çalıştır
  DetailPrint "Bağımlılıklar kontrol ediliyor..."
!macroend

!macro customUnInstall
  ; Kaldırma işlemi
  DetailPrint "Site Güvenlik kaldırılıyor..."
  ; userData klasöründeki verileri silme (kullanıcı verileri korunsun)
!macroend
