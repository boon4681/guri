import { defineConfig } from "guri";
import { hono } from "guri/adapters/hono";

export default defineConfig({
    adapter: hono(),
    server: {
        port: 3000,
    },
    alias:{
        "$db":"./src/db.ts"
    }
});
