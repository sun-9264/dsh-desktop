' DeepSeek Harness 桌面启动器（双击即用，无黑色窗口）
' 由 launcher.cjs 完成实际工作
Dim ws, fso, root
Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
' 隐藏窗口调用 Node 启动器
ws.Run "cmd /c node """ & root & "\launcher.cjs""", 0, False
