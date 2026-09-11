; EbookReader Optional OCR Pack Installer
; Installs PP-OCRv6 models and ONNX Runtime to %APPDATA%\com.peter-shi.ebookreader\ocr-assets

Unicode true
SetCompressor /SOLID lzma

!define PRODUCT_NAME "EbookReader Optional OCR Pack"
!define PRODUCT_VERSION "0.1.0"
!define PRODUCT_PUBLISHER "Peter Shi"
!define REG_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\EbookReader_OCR_Pack"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "..\target\release\bundle\ocr-pack\EbookReader_OCR_Pack_0.1.0_x64-setup.exe"
InstallDir "$APPDATA\com.peter-shi.ebookreader\ocr-assets"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite on

  File "..\ocr-assets\PP-OCRv6_det_medium.onnx"
  File "..\ocr-assets\PP-OCRv6_rec_small.onnx"
  File "..\ocr-assets\ch_ppocr_mobile_v2.0_cls_mobile.onnx"
  File "..\ocr-assets\onnxruntime.dll"
  File "..\ocr-assets\onnxruntime_providers_shared.dll"

  WriteUninstaller "$INSTDIR\uninstall-ocr-pack.exe"

  WriteRegStr HKCU "${REG_UNINSTALL}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "UninstallString" "$INSTDIR\uninstall-ocr-pack.exe"
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "NoModify" 1
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\PP-OCRv6_det_medium.onnx"
  Delete "$INSTDIR\PP-OCRv6_rec_small.onnx"
  Delete "$INSTDIR\ch_ppocr_mobile_v2.0_cls_mobile.onnx"
  Delete "$INSTDIR\onnxruntime.dll"
  Delete "$INSTDIR\onnxruntime_providers_shared.dll"
  Delete "$INSTDIR\uninstall-ocr-pack.exe"

  RMDir "$INSTDIR"

  DeleteRegKey HKCU "${REG_UNINSTALL}"
SectionEnd
