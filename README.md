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

- **Home Canvas** — Visual desktop canvas (powered by @xyflow/react) where documents, wikis, and todos are displayed as interactive nodes. Node positions are persisted across sessions.
- **Documents** — Create, edit, and manage Markdown documents with image embedding and full-text search. Import from TXT, MD, DOCX, and HTML files; export to Markdown.
- **Wikis** — Organize documents into wikis with a hierarchical directory tree. Link documents across directories via a many-to-many relationship model. Archive management included.
- **Knowledge Graph** — Automatically build knowledge graphs from wiki documents using LLM-powered entity extraction, relation extraction, entity merging, and gleaning (second-pass scan for missed entities). Visualized with ECharts 6.
- **AI Chat Assistant** — Conversational AI with streaming responses, deep thinking (reasoning) display, tool calling, and sub-agent orchestration. Supports workspace-based chat history persistence, skills integration, and image/document attachments.
- **Agent System** — Configure and manage sub-agents per workspace with custom system prompts and tool selections. Main agent supports configurable tools and skills.
- **Skill System** — Load custom skills from a local directory. Enable/disable individual skills for chat sessions.
- **Multi-Provider LLM Support** — Configure and manage multiple LLM providers with AES-256-GCM encrypted API keys. Supports OpenAI, Anthropic, DeepSeek, Google Gemini, Google Vertex AI, Mistral, Ollama, OpenRouter, xAI, AWS Bedrock, Cloudflare Workers AI, and any OpenAI-compatible endpoint.
- **Planner** — Task management with Gantt chart visualization, hierarchical task tree, task dependencies, priority, and completion status tracking.
- **Weather** — Local weather display with daily forecasts via Open-Meteo API, cached in electron-store for offline access.
- **Music Player** — Full-featured music player with folder-based playlist management, audio playback controls, now-playing display, track liking, recently played history, and a mini player widget in the sidebar. Supports importing local audio files with automatic metadata and cover art extraction.
- **Theme Switching** — Light/dark/auto theme support with persisted preference. Auto mode switches based on time of day (6:00 ~ 18:00).
- **Custom Window Frame** — Custom frameless window with title bar, sidebar navigation, bottom bar, and right bar panels.
- **Lock Screen** — Privacy protection with MD5-hashed password lock, triggered via Escape key.
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
| Canvas              | [@xyflow/react](https://xyflow.com/) 12                                                                |
| Routing             | [React Router](https://reactrouter.com/) 7                                                             |
| Markdown            | [react-markdown](https://github.com/remarkjs/react-markdown) 10                                        |
| AI / LLM            | [LangChain](https://www.langchain.com/) + [LangGraph](https://langchain-ai.github.io/langgraph/) + [deepagents](https://github.com/hwchase17/deepagents) |
| Database            | [PGLite](https://pglite.dev/) (PostgreSQL in WebAssembly)                                              |
| Visualization       | [ECharts](https://echarts.apache.org/) 6                                                               |
| Encryption          | AES-256-GCM (API key encryption) + MD5 (lock screen password)                                          |
| Icons               | [Remix Icon](https://remixicon.com/)                                                                   |
| Animation           | [animate.css](https://animate.style/) 4                                                                |
| Document Import     | [mammoth](https://github.com/mwilliamson/mammoth.js) (DOCX) + [turndown](https://github.com/mixmark-io/turndown) (HTML→MD) + [Readability](https://github.com/mozilla/readability) (article extraction) |
| Audio Metadata      | [music-metadata](https://github.com/Borewit/music-metadata) 11                                         |
| Weather             | [openmeteo](https://github.com/open-meteo/open-meteo)                                                  |
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
│   │   ├── chat/                    # AI chat service (LangChain + deepagents)
│   │   │   ├── index.ts             # Chat module entry & tool builders
│   │   │   ├── types.ts             # Chat message, tool call & sub-agent types
│   │   │   ├── service/             # Chat service internals
│   │   │   │   ├── chat.ts          # ChatService: streaming & tool orchestration
│   │   │   │   ├── history.ts       # Chat history loading & management
│   │   │   │   ├── message-builder.ts
│   │   │   │   ├── safe-backend.ts  # Filesystem backend with safety controls
│   │   │   │   ├── stream-handler.ts
│   │   │   │   └── stream-producers.ts
│   │   │   └── tools/               # Tool implementations
│   │   │       ├── builders.ts      # Tool builder registry
│   │   │       ├── docs.ts          # Document tools
│   │   │       ├── graph.ts         # Knowledge graph tools
│   │   │       ├── music.ts         # Music playback tools
│   │   │       ├── planner.ts       # Planner/task tools
│   │   │       ├── time.ts          # Time/date tools
│   │   │       ├── todos.ts         # Todo management tools
│   │   │       ├── weather.ts       # Weather information tools
│   │   │       └── wikis.ts         # Wiki management tools
│   │   ├── crypto/                  # Encryption utilities
│   │   │   └── provider-key.ts      # AES-256-GCM API key encryption
│   │   ├── database/                # PGLite database layer
│   │   │   ├── loading.ts           # Database initialization & migration
│   │   │   ├── sql/                 # SQL schema files
│   │   │   │   ├── chat.sql
│   │   │   │   ├── graph.sql
│   │   │   │   ├── images.sql
│   │   │   │   ├── llm_providers.sql
│   │   │   │   ├── music.sql
│   │   │   │   ├── node_positions.sql
│   │   │   │   ├── planner.sql
│   │   │   │   ├── schema_migrations.sql
│   │   │   │   ├── todos.sql
│   │   │   │   └── wiki.sql
│   │   │   └── mapper/              # Data access layer
│   │   │       ├── agent.ts
│   │   │       ├── chat.ts
│   │   │       ├── document.ts
│   │   │       ├── graph.ts
│   │   │       ├── image.ts
│   │   │       ├── music.ts
│   │   │       ├── node_position.ts
│   │   │       ├── planner.ts
│   │   │       ├── provider.ts
│   │   │       ├── todo.ts
│   │   │       ├── todo_dependencies.ts
│   │   │       └── wiki.ts
│   │   ├── graph/                   # Knowledge graph builder
│   │   │   ├── index.ts             # GraphBuilder entry
│   │   │   ├── prompts.ts           # LLM prompt templates for graph building
│   │   │   ├── schemas.ts           # Zod schemas for graph entity & relation validation
│   │   │   ├── types.ts             # Graph-related type definitions
│   │   │   ├── utils.ts             # Graph utility functions
│   │   │   └── service/             # Graph building sub-services
│   │   │       ├── append-docs.ts   # Append new documents to existing graph
│   │   │       ├── build-graph.ts   # Full graph build orchestration
│   │   │       ├── collect-docs.ts  # Document collection & chunking
│   │   │       ├── cross-chunk.ts   # Cross-chunk entity resolution
│   │   │       ├── extraction.ts    # Entity & relation extraction
│   │   │       ├── llm-invoke.ts    # LLM invocation helpers
│   │   │       └── merging.ts       # Entity merging & deduplication
│   │   ├── provider/                # LLM provider service
│   │   │   └── service.ts           # Multi-provider ChatModel factory
│   │   ├── shared/                  # Shared utilities
│   │   │   └── weather-utils.ts
│   │   ├── types/                   # Shared type definitions
│   │   │   └── settings.ts
│   │   └── index.ts                 # Main process entry & IPC handlers
│   ├── preload/                     # Preload scripts (context bridge)
│   │   ├── index.d.ts
│   │   └── index.ts
│   └── renderer/                    # Renderer process (React UI)
│       ├── resource/                # Static HTML, CSS, images
│       │   ├── css/
│       │   │   └── loading.css
│       │   ├── image/
│       │   │   ├── icon.png
│       │   │   └── logo.png
│       │   ├── script/
│       │   │   └── loading.ts
│       │   ├── types/
│       │   │   └── window.d.ts
│       │   ├── index.html
│       │   └── loading.html
│       └── src/
│           ├── assets/              # Static assets & global CSS
│           │   ├── logo.png
│           │   └── main.css
│           ├── components/          # Shared components
│           │   ├── document/        # Document management components
│           │   │   ├── DocumentCard.tsx
│           │   │   ├── DocumentEditModal.tsx
│           │   │   └── DocumentPreviewModal.tsx
│           │   ├── graph/           # Knowledge graph visualization
│           │   │   ├── BuildProgress.tsx
│           │   │   ├── EntityDetail.tsx
│           │   │   ├── GraphCanvas.tsx
│           │   │   ├── GraphToolbar.tsx
│           │   │   └── GraphView.tsx
│           │   ├── markdown/        # Markdown editor & viewer
│           │   │   ├── MarkdownEditor.tsx
│           │   │   ├── MarkdownLoad.tsx
│           │   │   ├── MarkdownView.tsx
│           │   │   └── markdown-body.css
│           │   ├── system/          # App shell & system components
│           │   │   ├── frame/       # Window frame components
│           │   │   │   ├── BottomBar.tsx
│           │   │   │   ├── RightBar.tsx
│           │   │   │   ├── Sidebar.tsx
│           │   │   │   └── TitleBar.tsx
│           │   │   ├── settings/    # Settings panel sub-components
│           │   │   │   ├── GeneralSettings.tsx
│           │   │   │   ├── GraphSettings.tsx
│           │   │   │   ├── ModelSettings.tsx
│           │   │   │   ├── MusicSettings.tsx
│           │   │   │   ├── SettingsModal.tsx
│           │   │   │   └── SystemInfo.tsx
│           │   │   ├── AppContent.tsx
│           │   │   ├── CustomFrame.tsx
│           │   │   ├── LockScreen.tsx
│           │   │   ├── MusicMiniPlayer.tsx
│           │   │   ├── NotificationList.tsx
│           │   │   └── SettingsPanel.tsx
│           │   ├── todo/            # Todo management components
│           │   │   ├── TodoEditModal.tsx
│           │   │   └── TodoPreviewModal.tsx
│           │   └── wiki/            # Wiki management components
│           │       ├── WikiArchiveModal.tsx
│           │       ├── WikiDirectoryTree.tsx
│           │       ├── WikiDocumentModal.tsx
│           │       ├── WikiEditModal.tsx
│           │       └── WikiPreviewModal.tsx
│           ├── contexts/            # React context definitions
│           │   ├── AudioContext.tsx
│           │   ├── ChatContext.tsx
│           │   ├── ChatContextCore.tsx
│           │   ├── MessageContext.tsx
│           │   ├── NotificationContext.tsx
│           │   ├── NotificationContextCore.ts
│           │   ├── ThemeContext.tsx
│           │   ├── ThemeContextCore.ts
│           │   ├── useNotification.ts
│           │   └── useTheme.ts
│           ├── hooks/               # Custom React hooks
│           │   ├── useBuildProgress.ts
│           │   └── useMessage.ts
│           ├── providers/           # Context providers
│           │   ├── BuildProgressContext.ts
│           │   ├── BuildProgressProvider.tsx
│           │   └── MessageProvider.tsx
│           ├── route/               # Route configuration (React Router 7)
│           │   └── MainRoutes.tsx
│           ├── types/               # Frontend type definitions
│           │   ├── audio.ts
│           │   ├── build-progress.ts
│           │   ├── chat.ts
│           │   ├── components.ts
│           │   ├── knowledge.ts
│           │   ├── models.ts
│           │   ├── music.ts
│           │   ├── notification.ts
│           │   ├── planner.ts
│           │   ├── provider.ts
│           │   ├── settings.ts
│           │   └── theme.ts
│           ├── utils/               # Utility functions
│           │   ├── composeProviders.tsx
│           │   ├── document.ts
│           │   ├── formatTime.ts
│           │   └── markdown.ts
│           ├── views/               # Page views
│           │   ├── chat/            # AI Chat with streaming, tool call display & sub-agent support
│           │   │   ├── components/
│           │   │   │   ├── messages/
│           │   │   │   │   ├── AssistantMessage.tsx
│           │   │   │   │   ├── LoadingMessage.tsx
│           │   │   │   │   └── UserMessage.tsx
│           │   │   │   ├── settings/
│           │   │   │   │   ├── AgentSettings.tsx
│           │   │   │   │   ├── ChatSettingsModal.tsx
│           │   │   │   │   ├── GeneralSettings.tsx
│           │   │   │   │   └── SkillsSettings.tsx
│           │   │   │   ├── ChatConstants.tsx
│           │   │   │   ├── ChatHeader.tsx
│           │   │   │   ├── ChatInput.tsx
│           │   │   │   ├── ChatMessageArea.tsx
│           │   │   │   ├── ChatSidebar.tsx
│           │   │   │   └── GuideSetupPanel.tsx
│           │   │   ├── hooks/
│           │   │   │   ├── useChatHandlers.ts
│           │   │   │   └── useTypewriter.ts
│           │   │   ├── utils/
│           │   │   │   └── chatHelpers.ts
│           │   │   └── Index.tsx
│           │   ├── home/            # Visual canvas dashboard
│           │   │   ├── components/
│           │   │   │   ├── nodes/
│           │   │   │   │   ├── DocNode.tsx
│           │   │   │   │   ├── TodoNode.tsx
│           │   │   │   │   └── WikiNode.tsx
│           │   │   │   ├── CanvasContextMenu.tsx
│           │   │   │   ├── MainContent.tsx
│           │   │   │   └── nodeTypes.ts
│           │   │   ├── hooks/
│           │   │   │   └── useThemePalette.ts
│           │   │   ├── utils/
│           │   │   │   ├── canvasConstants.ts
│           │   │   │   └── canvasUtils.ts
│           │   │   └── Index.tsx
│           │   ├── music/           # Music player page
│           │   │   ├── components/
│           │   │   │   ├── CreatePlaylistModal.tsx
│           │   │   │   ├── EditPlaylistModal.tsx
│           │   │   │   ├── MusicSidebar.tsx
│           │   │   │   ├── NowPlaying.tsx
│           │   │   │   ├── PlayerControls.tsx
│           │   │   │   └── PlaylistTable.tsx
│           │   │   └── Index.tsx
│           │   └── planner/         # Planner with Gantt chart & task tree
│           │       ├── components/
│           │       │   ├── GanttChart.tsx
│           │       │   ├── TaskModal.tsx
│           │       │   ├── TaskTree.tsx
│           │       │   └── Toolbar.tsx
│           │       └── Index.tsx
│           ├── App.tsx              # Root component
│           ├── env.d.ts             # Environment type declarations
│           └── main.tsx             # React entry point
├── resources/                       # Application icons
├── scripts/                         # Build & patch scripts
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

- **Main Process** (`src/main/`): Manages the application lifecycle, PGLite database, LLM provider factory, knowledge graph builder, chat service with streaming & tool orchestration, and handles all IPC communication with the renderer via typed handlers.
- **Preload** (`src/preload/`): Bridges the main and renderer processes through `contextBridge`, exposing a structured API (`api.docs`, `api.wikis`, `api.todoItems`, `api.planner`, `api.chat`, `api.graph`, `api.providers`, `api.agents`, `api.music`, `api.weather`, `api.systemSettings`, `api.nodePositions`, `api.window`) to the frontend.
- **Renderer** (`src/renderer/`): React 19 SPA with React Router 7 hash routing, styled with Ant Design 6 and Tailwind CSS 4. Features a custom frameless window with sidebar navigation, bottom bar with mini player, and right bar panels.

### Data Flow

```
Renderer (React) ──ipcRenderer──> Preload (contextBridge) ──ipcMain──> Main Process
                                                                          │
                                                                  ┌───────┼───────┐
                                                                  │       │       │
                                                               PGLite   LLM     Weather
                                                                  │   Provider  (Open-Meteo)
                                                                 SQL   Factory     │
                                                                              electron-store
```

---

## License

[MIT](./LICENSE) © [Aitenry](https://github.com/Aitenry)
