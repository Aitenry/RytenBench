<p align="center">
  <img src="./resources/logo.png" alt="RytenBench Logo" width="120" />
</p>

<h1 align="center">RytenBench</h1>

<p align="center">A modern personal productivity desktop application built with Electron, React, and TypeScript.</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-38.x-9feaf9" alt="Electron" />
  <img src="https://img.shields.io/badge/react-19.x-61dafb" alt="React" />
  <img src="https://img.shields.io/badge/typescript-5.9-3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/vite-7.x-646cff" alt="Vite" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## Features

- **Notes** — Create, edit, and manage Markdown notes with full-text search, image embedding, tagging, and version tracking.
- **Knowledge Base** — Organize notes into wikis with a hierarchical directory tree. Link notes across directories via a many-to-many relationship model.
- **Knowledge Graph** — Automatically build knowledge graphs from wiki notes using LLM-powered entity extraction, relation extraction, entity merging, and gleaning (second-pass scan for missed entities). Visualized with ECharts 6.
- **AI Chat Assistant** — Conversational AI with streaming responses, deep thinking (reasoning) display, and tool calling (weather, time). Supports chat history persistence by topic.
- **Multi-Provider LLM Support** — Configure and manage multiple LLM providers with AES-256-GCM encrypted API keys. Supports OpenAI, Anthropic, DeepSeek, Google Gemini, Google Vertex AI, Mistral, Ollama, OpenRouter, xAI, AWS Bedrock, Cloudflare Workers AI, and any OpenAI-compatible endpoint.
- **Planner** — Schedule overview and todo (matters) management with priority, due-date, category, and completion status tracking.
- **Developer Tools** — MCP (Model Context Protocol) repository browser and HTTP API calling interface.
- **Weather** — Local weather display with daily and hourly forecasts stored in PGLite.
- **Music Player** — Full-featured music player with playlist management, audio playback controls, now-playing display, and a mini player widget in the sidebar. Supports importing local audio files with automatic metadata extraction.
- **Theme Switching** — Light/dark theme support with a dedicated `ThemeContext`, persisted preference, and optimized logo assets for each theme.
- **Lock Screen** — Privacy protection with MD5-hashed password lock, triggered via Escape key or menu action.
- **Full-Text Search** — Fast local search powered by PGLite's built-in PostgreSQL `tsvector`/`tsquery` full-text search with relevance ranking.
- **Auto Update** — Built-in application update support via electron-updater.
- **Modern UI** — Clean, responsive interface built with Ant Design 6 and Tailwind CSS 4.
- **Cross-Platform** — Runs on Windows, macOS, and Linux.

---

## Tech Stack

| Layer               | Technology                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Framework           | [Electron](https://www.electronjs.org/) 38                                                            |
| Frontend            | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) 5.9                     |
| Build Tool          | [electron-vite](https://electron-vite.org/) 4 + [Vite](https://vite.dev/) 7                            |
| UI Library          | [Ant Design](https://ant.design/) 6 + [Tailwind CSS](https://tailwindcss.com/) 4                       |
| Routing             | [React Router](https://reactrouter.com/) 7                                                             |
| Markdown            | [react-markdown](https://github.com/remarkjs/react-markdown) 10 + [@uiw/react-md-editor](https://uiwjs.github.io/react-md-editor/) 4 |
| AI / LLM            | [LangChain](https://www.langchain.com/) + [LangGraph](https://langchain-ai.github.io/langgraph/) + [deepagents](https://github.com/hwchase17/deepagents) |
| Database            | [PGLite](https://pglite.dev/) (PostgreSQL in WebAssembly)                                              |
| Full-Text Search    | PostgreSQL built-in `tsvector`/`tsquery` (via PGLite)                                                  |
| Visualization       | [ECharts](https://echarts.apache.org/) 6                                                               |
| Encryption          | AES-256-GCM (API key encryption) + MD5 (lock screen password)                                          |
| Icons               | [Remix Icon](https://remixicon.com/)                                                                   |
| Animation           | [animate.css](https://animate.style/) 4                                                                |
| Audio Metadata      | [music-metadata](https://github.com/Borewit/music-metadata) 11                                         |
| Logging             | [electron-log](https://github.com/megahertz/electron-log)                                              |
| Config Persistence  | [electron-store](https://github.com/sindresorhus/electron-store)                                       |
| Auto Update         | [electron-updater](https://www.electron.build/auto-update)                                             |
| Packaging           | [electron-builder](https://www.electron.build/)                                                        |

---

## Project Structure

```
RytenBench/
├── src/
│   ├── main/                        # Electron main process
│   │   ├── address/                 # IP address utilities
│   │   │   └── index.ts
│   │   ├── chat/                    # AI chat service (LangChain)
│   │   │   ├── index.ts             # Chat module entry
│   │   │   ├── service.ts           # ChatService: streaming & tool orchestration
│   │   │   ├── tools.ts             # Tool registry (weather, time)
│   │   │   └── types.ts             # Chat message & tool types
│   │   ├── crypto/                  # Encryption utilities
│   │   │   └── provider-key.ts      # AES-256-GCM API key encryption
│   │   ├── database/                # PGLite database layer
│   │   │   ├── loading.ts           # Database initialization & migration
│   │   │   ├── sql/                 # SQL schema files
│   │   │   │   ├── create_tables.sql
│   │   │   │   ├── graph_tables.sql
│   │   │   │   ├── llm_providers.sql
│   │   │   │   └── urban_resource.sql
│   │   │   └── mapper/              # Data access layer
│   │   │       ├── chat.ts
│   │   │       ├── city.ts
│   │   │       ├── graph.ts
│   │   │       ├── image.ts
│   │   │       ├── music.ts
│   │   │       ├── note.ts
│   │   │       ├── provider.ts
│   │   │       ├── todo.ts
│   │   │       └── wiki.ts
│   │   ├── graph/                   # Knowledge graph builder
│   │   │   ├── index.ts             # GraphBuilder: entity extraction, relation extraction, gleaning
│   │   │   ├── prompts.ts           # LLM prompt templates for graph building
│   │   │   └── schemas.ts           # Zod schemas for graph entity & relation validation
│   │   ├── provider/                # LLM provider service
│   │   │   └── service.ts           # Multi-provider ChatModel factory
│   │   ├── types/                   # Shared type definitions
│   │   │   └── settings.ts
│   │   └── index.ts                 # Main process entry & IPC handlers
│   ├── preload/                     # Preload scripts (context bridge)
│   │   ├── index.d.ts
│   │   └── index.ts
│   └── renderer/                    # Renderer process (React UI)
│       ├── resource/                # Static HTML, CSS, images
│       │   ├── index.html
│       │   └── loading.html
│       └── src/
│           ├── assets/              # Static assets & global CSS
│           │   ├── logo.png
│           │   ├── logo-light.png
│           │   ├── logo-night.png
│           │   └── main.css
│           ├── components/          # Shared components
│           │   ├── AppContent.tsx    # App-level layout wrapper
│           │   ├── ImportNovelModal.tsx
│           │   ├── LockScreen.tsx
│           │   ├── MarkdownEditor.tsx
│           │   ├── MarkdownLoad.tsx  # Markdown loading/preview
│           │   ├── MarkdownView.tsx
│           │   ├── MusicMiniPlayer.tsx
│           │   ├── NoteCard.tsx
│           │   ├── NotePreviewModal.tsx
│           │   └── Sidebar.tsx
│           ├── contexts/            # React context definitions
│           │   ├── AudioContext.tsx  # Audio playback state & controls
│           │   ├── MessageContext.tsx
│           │   ├── ThemeContext.tsx
│           │   ├── ThemeContextCore.ts
│           │   └── useTheme.ts      # useTheme custom hook
│           ├── hooks/               # Custom React hooks
│           │   └── useMessage.ts
│           ├── providers/           # Context providers
│           │   └── MessageProvider.tsx
│           ├── route/               # Route configuration (React Router 7)
│           ├── types/               # Frontend type definitions
│           │   └── music.ts         # Music-related types
│           ├── utils/               # Utility functions
│           │   ├── formatTime.ts    # Time formatting helpers
│           │   ├── markdown.ts      # Markdown processing utilities
│           │   └── note.ts          # Note-related utilities
│           ├── views/               # Page views
│           │   ├── chat/            # AI Chat with streaming & tool call display
│           │   ├── home/            # Dashboard with todo sidebar
│           │   │   └── components/  # CardItem, MainContent, MusicMiniCard, TodoItem
│           │   ├── knowledge/       # Knowledge base management & graph visualization
│           │   │   ├── manage/      # Wiki & directory management
│           │   │   └── graph/       # ECharts-powered knowledge graph viewer (BuildProgress, EntityDetail, GraphCanvas, GraphToolbar)
│           │   ├── music/           # Music player page
│           │   │   └── components/  # CreatePlaylistModal, EditPlaylistModal, MusicSidebar, NowPlaying, PlayerControls, PlaylistTable
│           │   ├── notes/           # Note CRUD management
│           │   ├── planner/         # Schedule overview & matters management
│           │   │   ├── schedule/    # Calendar schedule view
│           │   │   └── matters/     # Todo items management
│           │   ├── settings/        # Provider config & system settings
│           │   ├── tools/           # MCP browser & API caller
│           │   │   ├── mcp/
│           │   │   └── api/
│           │   └── weather/         # Weather display
│           ├── App.tsx              # Root component
│           ├── env.d.ts             # Environment type declarations
│           └── main.tsx             # React entry point
├── resources/                       # Application icons
├── package.json
├── electron-builder.yml             # Build & packaging configuration
├── electron.vite.config.ts          # Vite bundler configuration
├── tsconfig.json                    # TypeScript root config
├── tsconfig.node.json               # Main process TypeScript config
└── tsconfig.web.json                # Renderer process TypeScript config
```

---

## Supported LLM Providers

| Provider             | Class                            | Notes                         |
| -------------------- | -------------------------------- | ----------------------------- |
| OpenAI               | ChatOpenAI                       | Supports custom base URL      |
| Anthropic            | ChatAnthropic                    | Claude models                 |
| DeepSeek             | ChatDeepSeek                     | Includes reasoning support    |
| Google Gemini        | ChatGoogleGenerativeAI           | Generative Language API       |
| Google Vertex AI     | ChatVertexAI                     | Enterprise Google Cloud       |
| Mistral AI           | ChatMistralAI                    | Mistral models                |
| Ollama               | ChatOllama                       | Local LLM runtime             |
| OpenRouter           | ChatOpenRouter                   | Multi-model gateway           |
| xAI                  | ChatXAI                          | Grok models (OpenAI-compatible) |
| AWS Bedrock          | ChatBedrockConverse              | Amazon Bedrock Converse API   |
| Cloudflare Workers AI| ChatCloudflareWorkersAI          | Edge-deployed models          |
| Custom / OpenAPI     | ChatOpenAI (fallback)            | Any OpenAI-compatible endpoint |

API keys are encrypted with **AES-256-GCM** using a machine-specific key derived from hostname, username, and user data path — keys are bound to the machine where they were created.

---

## Getting Started

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
# Start development server with hot reload
pnpm dev
```

### Build

```bash
# Build for Windows (NSIS installer)
pnpm build:win

# Build for macOS (DMG)
pnpm build:mac

# Build for Linux (AppImage, snap, deb)
pnpm build:linux
```

---

## Architecture Overview

The application follows Electron's **multi-process architecture**:

- **Main Process** (`src/main/`): Manages the application lifecycle, PGLite database, full-text search, LLM provider factory, knowledge graph builder, and handles all IPC communication with the renderer via typed handlers.
- **Preload** (`src/preload/`): Bridges the main and renderer processes through `contextBridge`, exposing a structured API (`api.todoItems`, `api.notes`, `api.wikis`, `api.chat`, `api.graph`, `api.providers`, `api.systemSettings`) to the frontend.
- **Renderer** (`src/renderer/`): React 19 SPA with React Router 7 hash routing, styled with Ant Design 6 and Tailwind CSS 4. Features a sidebar navigation with a dynamic mini player/weather card at the bottom.

### Data Flow

```
Renderer (React) ──ipcRenderer──> Preload (contextBridge) ──ipcMain──> Main Process
                                                                          │
                                                                  ┌───────┼───────┐
                                                                  │       │       │
                                                               PGLite  FTS via  LLM
                                                                  │    tsvector Provider
                                                                 SQL   Index  Factory
```

---

## License

[MIT](./LICENSE) © [Aitenry](https://github.com/Aitenry)
