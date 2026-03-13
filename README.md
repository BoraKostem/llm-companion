# @borakostem/llm-companion

A Freelens extension that adds a context-aware LLM chat assistant for Kubernetes clusters.

## Features

- **Multi-provider support** — OpenAI, Anthropic (Claude), Google Gemini, and Ollama
- **Dynamic model discovery** — fetches available models from each provider's API
- **Context-aware** — automatically reads your current Freelens view (pods, deployments, services, etc.) and provides it as context to the LLM
- **kubectl integration** — the assistant can run read-only kubectl commands against your cluster with user confirmation before execution
- **Multi-turn conversation** — maintains chat history within a session
- **Safety guards** — only read-only kubectl commands are allowed; destructive operations are blocked

## Requirements

- Freelens >= 1.8.0
- kubectl configured and accessible in PATH
- An API key for at least one supported provider (or a local Ollama instance)

## Supported Providers

| Provider      | API Key Required | Custom Base URL                         |
| ------------- | ---------------- | --------------------------------------- |
| OpenAI        | Yes              | Optional                                |
| Anthropic     | Yes              | No                                      |
| Google Gemini | Yes              | No                                      |
| Ollama        | No               | Yes (default: `http://127.0.0.1:11434`) |

## Install

Open Freelens, go to Extensions (`Ctrl+Shift+E` / `Cmd+Shift+E`), and install `@borakostem/llm-companion`.

## Configuration

After installing, go to Freelens **Preferences > Extensions > LLM Companion** to configure:

1. Select your preferred LLM provider
2. Enter the API key for your provider
3. Choose a model from the dynamically loaded list

## Build from Source

### Prerequisites

- Node.js >= 22
- pnpm (via corepack)

### Build

```sh
corepack install
pnpm install
pnpm build
pnpm pack
```

Or use the dev build script:

```sh
pnpm pack:dev
```

### Install Built Extension

The tarball will be placed in the project root. In Freelens, navigate to the Extensions list and provide the path to the tarball, or drag and drop it into the Freelens window.

## License

MIT
