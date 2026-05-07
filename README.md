# Notes - Advanced Minimal Text Editor

A lightweight Electron-based desktop notes application featuring multi-tab editing, rich text tools, image embedding, session persistence, and a modern frameless Windows interface.

Built for a clean desktop experience without unnecessary clutter. Rare behavior in software now. Most apps behave like abandoned shopping malls with buttons.

**Windows 11 Advanced Notepad Version**

---

## Features

### Frameless Desktop Interface
- Custom frameless Electron window
- Native-feeling title bar and controls
- Lightweight minimal UI
- Smooth desktop workflow

### Multi Tab Editing
- Create multiple tabs
- Open and manage files independently
- Reopen last closed tab
- Active tab management

### File Operations
- New File
- Open File
- Save
- Save As
- Print support

### Rich Editing Tools
- Undo / Redo
- Cut / Copy / Paste
- Find navigation
- Keyboard shortcuts support

### Image Support
- Insert images from local files
- Drag and drop image support
- Paste images from clipboard
- In-editor image embedding
- Interactive image resizing

### Session Persistence
- Restores open tabs on relaunch
- Saves editor content and backgrounds
- Workspace recovery support
- Unsaved-change exit protection

### Customization
- Per-tab background color or image
- Font customization support
- Persistent appearance settings

---

# Technologies

| Technology | Purpose |
|---|---|
| Electron | Desktop application framework |
| Node.js | Backend and filesystem operations |
| JavaScript | Core application logic |
| HTML | User interface structure |
| CSS | Styling and layouts |
| Electron Builder | Windows packaging and installer generation |

---

# Installation

## Prerequisites

- Node.js 16+
- npm

## Clone and Install

```bash
git clone https://github.com/your-username/notes.git

cd notes/app

npm install
```

---

# Run Development Build

```bash
npm start
```

---

# Build for Windows

```bash
npm run build
```

Uses Electron Builder to generate a Windows installer configured through `package.json`.

Because packaging desktop apps manually in 2026 still somehow feels like assembling IKEA furniture without instructions.

---

# Usage Highlights

| Shortcut | Action |
|---|---|
| Ctrl + N | Create new tab |
| Ctrl + Shift + T | Reopen last closed tab |
| Ctrl + O | Open file |
| Ctrl + S | Save file |
| Ctrl + Shift + S | Save As |
| Ctrl + I | Insert image |
| Ctrl + F | Find text |
| Ctrl + | Selected text size incress |
| Ctrl + Mouse Wheel Up-Down | Zoom in, Zoom-Out |
| Right-click On Selected text | Highlight Text, Change colorm, Bold, Italic, Underline |
| Ctrl + B | Bold text |




### Additional Actions
- Drag and drop images directly into the editor
- Paste images from clipboard
- Resize images interactively by selecting them
- Restore previous workspace automatically on startup

---

# File Format

Saved note files include a lightweight `[META:...]` header used to preserve:
- Tab background settings
- Appearance customization
- Embedded image references

Embedded images are stored using data URIs for standalone portability.

Tiny hidden metadata. Humanity's favorite trick after taxes and subscription renewals.

---

# Contributing

Contributions, bug reports, and pull requests are welcome.

Please:
- Test changes locally before submitting
- Include screenshots for UI modifications
- Keep code clean and consistent

---

# License

Specify your preferred license here.

Example:
```txt
MIT License
```

---

# Author

**Harshil Vanparia | Ghost**

---

# Contributing

Pull requests are welcome.

For major changes, please open an issue first before launching tactical missiles into the codebase.
