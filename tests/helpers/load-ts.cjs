const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const root = path.resolve(__dirname, '../..')
function loadTs(file, overrides = {}, globals = {}) {
  const filename = path.join(root, file), exports = {}
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  vm.runInNewContext(source, { exports, Buffer, process, console, URL, TextDecoder, TextEncoder, ...globals, require(name) { if (name in overrides) return overrides[name]; if (name === 'server-only') return {}; return require(name) } }, { filename })
  return exports
}
module.exports = { root, loadTs }
