<p align="center">
  <img src="./resources/logo.png" alt="RytenBench Logo" width="120" />
</p>

<h1 align="center">RytenBench</h1>

> A modern personal productivity desktop application built with Electron, React, and TypeScript.

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-38.x-9feaf9" alt="Electron" />
  <img src="https://img.shields.io/badge/react-19.x-61dafb" alt="React" />
  <img src="https://img.shields.io/badge/typescript-5.9-3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

## ✨ Features

- **📝 Notes** — Create, edit, and manage markdown notes with full CRUD support and image embedding.
- **📚 Knowledge Base** — Organize notes into wikis with a directory tree structure and knowledge graph visualization.
- **📅 Planner** — Schedule overview and todo management with priority and due-date tracking.
- **🤖 AI Chat Assistant** — Built-in AI chat powered by LangChain with streaming response, deep thinking, and smart search.
- **🔧 Developer Tools** — MCP repository browser and API calling interface.
- **🌤️ Weather** — Local weather display with real-time information.
- **🎵 Music Player** — Built-in mini music player widget.
- **🔒 Lock Screen** — Privacy protection with password-based lock screen.
- **🔍 Full-Text Search** — Fast local search powered by FlexSearch with SQLite indexing.
- **🎨 Modern UI** — Clean interface built with Ant Design 6 and Tailwind CSS 4.
- **✈️ Cross-Platform** — Runs on Windows, macOS, and Linux.

## 🛠️ Tech Stack

| Layer           | Technology                                                                |
| --------------- | ------------------------------------------------------------------------- |
| Framework       | [Electron](https://www.electronjs.org/) 38                                |
| Frontend        | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) 5.9 |
| Build Tool      | [electron-vite](https://electron-vite.org/) 4                             |
| UI Library      | [Ant Design](https://ant.design/) 6 + [Tailwind CSS](https://tailwindcss.com/) 4 |
| Routing         | [React Router](https://reactrouter.com/) 7                                |
| Markdown        | [react-markdown](https://github.com/remarkjs/react-markdown) 10 + [@uiw/react-md-editor](https://uiwjs.github.io/react-md-editor/) 4 |
| AI / LLM        | [LangChain](https://www.langchain.com/) + [@langchain/openai](https://js.langchain.com/) |
| Database        | [PGLite](https://pglite.dev/) + [SQLite3](https://www.sqlite.org/)       |
| Search Engine   | [FlexSearch](https://github.com/nextapps-de/flexsearch)                   |
| Icons           | [Remix Icon](https://remixicon.com/)                                      |
| Packaging       | [electron-builder](https://www.electron.build/)                           |

## 📂 Project Structure

```
RytenBench/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── address/           # IP address utilities
│   │   ├── chat/              # AI chat service (LangChain)
│   │   ├── database/          # SQLite database & mappers
│   │   ├── search/            # FlexSearch indexer
│   │   └── index.ts           # Main entry & IPC handlers
│   ├── preload/               # Preload scripts
│   └── renderer/              # Renderer process (React UI)
│       ├── resource/          # Static HTML & assets
│       └── src/
│           ├── assets/        # Images & CSS
│           ├── components/    # Shared components
│           ├── hooks/         # Custom React hooks
│           ├── providers/     # Context providers
│           ├── route/         # Route configuration
│           ├── utils/         # Utility functions
│           └── views/         # Page views
│               ├── chat/      # AI Chat
│               ├── home/      # Dashboard
│               ├── knowledge/ # Knowledge base & graph
│               ├── music/     # Music player
│               ├── notes/     # Note management
│               ├── planner/   # Schedule & todos
│               ├── tools/     # MCP & API tools
│               └── weather/   # Weather display
├── resources/                 # Application icons
├── package.json
├── electron-builder.yml       # Build configuration
├── electron.vite.config.ts    # Vite bundler config
└── tsconfig.json
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) (recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/Aitenry/RytenBench.git
cd RytenBench

# Install dependencies
pnpm install
```

### Development

```bash
# Start development server
pnpm dev
```

### Build

```bash
# Build for Windows
pnpm build:win

# Build for macOS
pnpm build:mac

# Build for Linux
pnpm build:linux
```

## 📄 License

[MIT](./LICENSE) © [Aitenry](https://github.com/Aitenry)


