import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
plugins: [react()],

server: {
host: "0.0.0.0",
port: 5000,
allowedHosts: true,
},

define: {
"process.env": {},
global: "globalThis",
},

resolve: {
alias: {
"text-encoding-utf-8": path.resolve(
"node_modules/text-encoding-utf-8/lib/encoding.lib.js"
),
"bigint-buffer": path.resolve(
"node_modules/bigint-buffer/dist/browser.js"
),
},
},

optimizeDeps: {
esbuildOptions: {
target: "esnext",
define: {
global: "globalThis",
},
},
},

build: {
sourcemap: false,
target: "esnext",
},
});