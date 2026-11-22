import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'lib',
    external: [/^@deepseek-ai\//, /^node:/],
  },
  {
    entry: ['src/client/index.ts'],
    format: ['cjs'],
    dts: false,
    outDir: 'lib/client',
    fixedExtension: false,
    external: [/^@deepseek-ai\//, 'react', 'react/jsx-runtime'],
    onSuccess() {
      const cjsFile = 'lib/client/index.cjs'
      const jsFile = 'lib/client/index.js'
      const body = readFileSync(cjsFile, 'utf8')
      const wrapped = `window.__ModuleLoader__.load({id:"dsh-delete-session",factory:require=>{var module={exports:{}};var exports=module.exports;\n${body}\nreturn module.exports}});\n`
      writeFileSync(jsFile, wrapped, 'utf8')
      unlinkSync(cjsFile)
    },
  },
])
