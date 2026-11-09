import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
const config = [...nextVitals, ...nextTypescript, {
  // React Compiler is not enabled. Session guards and asynchronous loaders use
  // effects intentionally; the standard hooks and dependency rules remain on.
  rules: { "react-hooks/set-state-in-effect": "off" },
}, { ignores: [".next/**", "node_modules/**"] }];
export default config;
