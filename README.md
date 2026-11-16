# json-tree-viewer
A lightweight, browser-based JSON viewer with validation, formatting, minification, search, interactive tree navigation, a Unix timestamp converter, an API Viewer, and light/dark modes. The timestamp converter detects seconds or milliseconds, displays the corresponding UTC date, and converts local date and time values back to timestamps. Built with vanilla HTML, CSS, and JavaScript, with no dependencies or backend.

## Installation

Download the project as a ZIP from [GitHub](https://github.com/cryptoumit/json-viewer) and extract it. Open `index.html` in your browser to start using JSON Viewer.

## API Viewer

The API Viewer sends requests directly from your browser and supports GET, POST, PUT, PATCH, and DELETE, with custom headers and an optional JSON body. It shows response status, timing, content type, size, and accessible headers. Valid JSON opens in the existing editor and tree; other response content is shown as text and is never executed.

No API response is sent through a proxy or stored by the app. Requests require the target API to allow browser cross-origin access (CORS), so some APIs will not work. Browser code cannot bypass CORS. For local use, open the project in VS Code and start `index.html` with the Live Server extension; the API must still allow requests from that origin.

## Screenshot

<table>
  <tr>
    <td><img src="assets/sample-json.png" alt="JSON Viewer showing a formatted sample in dark mode" width="100%"></td>
    <td><img src="assets/sample-json-light.png" alt="JSON Viewer showing a formatted sample in light mode" width="100%"></td>
  </tr>
</table>

## Keyboard shortcuts

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Focus tree search | `⌘F` or `/` | `Ctrl+F` or `/` |
| Clear tree search and return to the editor | `Esc` (while search is focused) | `Esc` (while search is focused) |
| Format JSON | `⌥⇧F` or `⌘Enter` | `Alt+Shift+F` or `Ctrl+Enter` |
| Minify JSON | `⌥⇧J` | `Alt+Shift+J` |

The `/` shortcut focuses search when you are not typing in an input or text area.
