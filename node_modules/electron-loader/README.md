### Usage
```
electron node_modules/electron-loader
```
`app.json` must exist in your application's root directory.

### Example app.json
```json
{
	"main": "index.html",
	"main_js": "index.js",
	"window": {
		"title": "My App",
		"icon": "icon.ico",
		"width": 500,
		"height": 500,
		"useContentSize": true,
		"backgroundColor": "#000",
		"webPreferences": {
			"nodeIntegration": true
		}
	}
}
```