Set shell = CreateObject("Wscript.Shell")
' 使用 cmd /c 執行 npm start，因為 npm 在 Windows 上是 .cmd 批次檔，必須經由 cmd 直譯器執行
' 0 代表隱藏 CMD 視窗，False 代表不需要等待執行完成即可結束 VBS 腳本
shell.Run "cmd /c npm start", 0, False
