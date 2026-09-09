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

// File editing should stay quiet about syntax/semantic problems.
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
  noSuggestionDiagnostics: true
})
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
  noSuggestionDiagnostics: true
})
monaco.json.jsonDefaults.setDiagnosticsOptions({ validate: false })
monaco.css.cssDefaults.setOptions({ validate: false })
monaco.css.scssDefaults.setOptions({ validate: false })
monaco.css.lessDefaults.setOptions({ validate: false })
monaco.html.htmlDefaults.setModeConfiguration({
  ...monaco.html.htmlDefaults.modeConfiguration,
  diagnostics: false
})
