const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require("electron")
const path = require("path")

const createWindow = () => {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,

		icon: path.join(__dirname, "res/icon/xl.png"),

		webPreferences: {
			preload: path.join(__dirname, 'process.js')
		}
	})
	const contents = win.webContents

	win.removeMenu()
	win.loadFile("index.html")

	ipcMain.on("show-folder-dialog", (event) => {
		let path = dialog.showOpenDialogSync(win, { title: "Choose Folder", properties: ["openDirectory"] });
		event.returnValue = (path) ? path[0] : "CANCEL";
	})

	nativeTheme.on("updated", () => {
		contents.send("native-theme-update", nativeTheme.shouldUseDarkColors);
	})
}

// Window Functions
app.whenReady().then(() => {
	createWindow()

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit()
})

// Sending Path
ipcMain.on("get-appdata", (event) => {
	event.returnValue = [app.getPath("userData"), app.getPath("documents"), nativeTheme.shouldUseDarkColors];
})
