# Contributing to YTRemote

First off, thanks for considering contributing! 🎵

## How to Contribute

### Reporting Bugs
- Use the [GitHub Issues](https://github.com/ioannisdev/ytremote/issues) page
- Include your browser version, OS, and steps to reproduce

### Suggesting Features
- Open an issue with the `enhancement` label
- Describe the use case, not just the feature

### Pull Requests
1. Fork the repo
2. Create a feature branch (`git checkout -b feature/awesome-thing`)
3. Commit with clear messages (German or English)
4. Push and open a PR

### Development Setup

```bash
# Server
cd server
npm install
cp .env.example .env
npm run dev

# Web Remote
cd web
npm install
npm run dev

# Extension
# Load "extension/" as unpacked in chrome://extensions
```

### Code Style
- Comments in German
- Vanilla JS for the extension (no build step)
- Vue 3 Composition API for the web remote
- Keep it simple – this project should be accessible to beginners

## YouTube Music Selectors

The biggest maintenance task is keeping DOM selectors up to date when YouTube Music changes their UI. If you notice broken controls, check `extension/src/content/player-bridge.js` and update the `SELECTORS` object.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
