# Repository guidance

## Project

- This is a small, static JSON and API viewer built with vanilla HTML, CSS, and JavaScript.
- `index.html` contains the page structure, `css/style.css` contains presentation, and `js/app.js` contains application behavior.
- The app has no build step, package manager, dependencies, server, or backend. Keep it usable by opening `index.html` directly, and preserve GitHub Pages compatibility.
- `README.md` is the user-facing source for setup, behavior, limitations, and keyboard shortcuts. Update it when user-visible behavior or setup changes.

## Implementation conventions

- Prefer small, focused changes in the existing files. Do not introduce frameworks, dependencies, build tooling, or a backend unless the task requires them.
- Keep the app self-contained and usable in current browsers with standard platform APIs.
- Preserve keyboard operation, semantic HTML, accessible names and states, and the existing light/dark theme behavior when changing the interface.
- Keep user-provided content in text contexts (`textContent`, form values, or DOM text nodes). Do not execute, inject, or render API response HTML or scripts. Treat imported JSON and API data as untrusted input.
- Keep API requests browser-only. Do not add a proxy or persist request/response data. Preserve the current HTTP(S)-only URL handling, CORS explanation, credential safeguards, request timeout/cancellation, and response size limit unless a task explicitly changes that behavior.
- Avoid logging request headers, credentials, or response contents.
- Use the existing naming and formatting style in the file being edited; avoid unrelated reformatting.

## Changes and documentation

- Keep examples and screenshots in `examples/` and `assets/` respectively; avoid committing secrets or real credentials in either.
- Update `README.md` for changes that affect user-visible features, browser limitations, installation, or shortcuts.
- Do not claim a change was tested unless it was. 
