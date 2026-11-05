import {defineConfig} from "vite";
import {offlineShell} from "./scripts/offlineShell.js";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins:[react(),offlineShell()],
  server:{port:5173},
  test:{maxWorkers:1,fileParallelism:false,exclude:["**/node_modules/**","src/utils/web3.test.js"]}
});
