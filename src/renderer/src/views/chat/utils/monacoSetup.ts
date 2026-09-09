import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

// Configure Monaco Environment for Vite bundler
// Vite uses ?worker suffix to properly bundle web workers
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

// Use local Monaco Editor instead of CDN (required for offline Electron use)
loader.config({ monaco })

export function disableMonacoValidation(api: typeof monaco): void {
  // File editing should stay quiet about syntax/semantic problems.
  // Language contributions can be missing during a hot module reload,
  // so guard every namespace before touching its defaults.
  if (api.typescript) {
    api.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true
    })
    api.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true
    })
  }
  if (api.json) {
    api.json.jsonDefaults.setDiagnosticsOptions({ validate: false })
  }
  if (api.css) {
    api.css.cssDefaults.setOptions({ validate: false })
    api.css.scssDefaults.setOptions({ validate: false })
    api.css.lessDefaults.setOptions({ validate: false })
  }
  if (api.html) {
    api.html.htmlDefaults.setModeConfiguration({
      ...api.html.htmlDefaults.modeConfiguration,
      diagnostics: false
    })
  }
}

disableMonacoValidation(monaco)
