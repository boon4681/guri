import { defineConfig } from "@boon4681/giri";
import { hono } from "@boon4681/giri/adapters/hono";

export default defineConfig({
    adapter: hono(),
    server: {
        port: 3000,
    },
    alias:{
        "$db":"./src/db.ts"
    }
});
