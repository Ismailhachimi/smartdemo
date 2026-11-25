# Contributing to SmartDemo

Thanks for helping out!

## Getting started

```bash
./scripts/create-signing-cert.sh   # once, keeps macOS permissions across rebuilds
./build.sh --install
```

Restart the app after a rebuild: `pkill -x SmartDemo; open ~/Applications/SmartDemo.app`.

## Before opening a pull request

- `./build.sh` builds without warnings you introduced.
- `build/SmartDemo.app/Contents/MacOS/SmartDemo --selftest selftest` runs and the frames look right.
- For capture, camera or shortcut changes, record a short video and check sound sync, zoom and the bubble.
- Keep pull requests focused: one feature or fix per PR.

## Code style

- Swift 5, 4-space indentation (see `.editorconfig`).
- UI work happens on the main thread. Rendering goes through `Director.snapshot()`.
- Never commit recordings, certificates or keys. `.gitignore` already covers the usual files.

## Reporting bugs

Please include your macOS version, your Mac model (Apple silicon or Intel), the capture source
(screen, window, app or zone) and the steps to reproduce.
