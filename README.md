# RytenBench - Lightweight Personal AI Workbench

RytenBench is a lightweight AI workbench designed specifically for individual users, integrating various commonly used functions in daily work and study, aimed at improving personal efficiency and productivity. It is built as a cross-platform desktop application using Electron, React, and TypeScript.

## Features

- **Lightweight Design**: Clean interface design, fast loading, low resource consumption
- **Multi-Function Integration**: Integrate multiple commonly used tools in one platform
- **AI Powered**: Integrated AI functions, providing intelligent assistance
- **Cross-Platform**: Runs natively on Windows, macOS, and Linux
- **Personalization**: Support for personalized settings and customization

## Function Modules

### 📊 Dashboard
- Workbench overview
- Quick access entry
- Personal data statistics

### 📝 Notes
- Smart note-taking
- AI-assisted writing
- Note classification management

### 🧠 Knowledge
- Knowledge base management
- Intelligent knowledge organization
- Knowledge graph construction

### 📅 Planner
- Schedule arrangement
- Task management
- Time planning

### 🔧 Tools
- Utility tool collection
- Efficiency enhancement tools
- Convenient mini tools

### ☀️ Weather
- Real-time weather information
- Weather forecast
- Life index

### 🎵 Music
- Background music playback
- Focus music recommendations
- Music playback control

## Tech Stack

- **Desktop Framework**: [Electron](https://www.electronjs.org/)
- **Build Tooling**: [electron-vite](https://electron-vite.org) (Next Generation Electron Build Tooling)
- **Frontend Framework**: React (v19)
- **Language**: TypeScript
- **UI Library**: Ant Design (v5)
- **Icons**: Remix Icon
- **Styling**: Tailwind CSS
- **Packaging**: electron-builder
- **Routing**: React Router DOM

## Installation & Usage

### Prerequisites

- Node.js (>=18.0.0 recommended based on dependencies)
- pnpm

### Installation Steps

1.  Clone the project:
    ```bash
    git clone <repository-url>
    cd RytenBench
    ```

2.  Install dependencies (using pnpm is recommended based on the `pnpm` section in `package.json`):
    ```bash
    pnpm install
    # Or if pnpm is not installed globally:
    # npx pnpm install
    ```

3.  **Development Mode**: To start the application in development mode with hot reloading:
    ```bash
    pnpm dev
    ```

4.  **Preview Production Build**: To build the application and run a preview:
    ```bash
    pnpm start
    ```

5.  **Build for Production**: To create distributable packages for your platform:
    ```bash
    # For Windows:
    pnpm build:win

    # For macOS:
    pnpm build:mac

    # For Linux:
    pnpm build:linux

    # For a platform-specific unpacked directory (for testing):
    pnpm build:unpack
    ```

## Project Structure & Scripts

- **`main`**: Points to the compiled Electron main process entry point (`./out/main/index.js`).
- **`scripts`**:
  - `dev`: Starts the application in development mode using `electron-vite dev`.
  - `start`: Builds and previews the production build using `electron-vite preview`.
  - `build`: Runs type checks and then builds the application using `electron-vite build`.
  - `build:win/mac/linux/unpack`: Scripts to build distributable packages for specific platforms using `electron-builder`.
  - `typecheck`: Runs TypeScript type checks for both main and renderer processes.
  - `lint`: Lints the codebase using ESLint.
  - `format`: Formats the codebase using Prettier.
  - `postinstall`: Runs `electron-builder install-app-deps` after dependencies are installed.

## Main Components

### Header Component

Top navigation bar component, including:

- **Logo Area**: Displays RytenBench brand identity
- **Main Menu**: Quick access to 7 core function modules
- **Search Function**: Global search box
- **User Menu**: User-related operations (settings, notifications, messages, logout)

## Design Philosophy

RytenBench adopts a simple and intuitive interface design, using a combination of icons and text to allow users to quickly understand and use various functions. The overall design follows modern UI/UX principles, focusing on user experience and operational efficiency. Built with Electron, it provides a native desktop application experience across different operating systems.

## Contributing

Welcome to submit Issues and Pull Requests to help improve RytenBench.

## Support

For help or suggestions, please contact us through the following methods:

- Author: [Aitenry](https://github.com/Aitenry)
- Build Tooling: [electron-vite](https://electron-vite.org)
