Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

shell.Run """" & scriptDir & "\\start-flowfocus.cmd"""", 0, False
