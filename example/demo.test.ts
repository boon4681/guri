import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildGuriApp } from "guri";
import config from "./guri.config";

const cwd = fileURLToPath(new URL(".", import.meta.url));

describe("example app", () => {
    it("serves generated file routes through the configured adapter", async () => {
        const built = await buildGuriApp(config, { cwd });
        const response = await config.adapter.fetch(
            built.app,
            new Request("http://guri.test/users/1", {
                headers: {
                    "x-request-id": "demo-1",
                },
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            id: "1",
            name: "Ada Lovelace",
        });
    });

    it("validates request bodies for declared inputs", async () => {
        const built = await buildGuriApp(config, { cwd });

        const created = await config.adapter.fetch(
            built.app,
            new Request("http://guri.test/users", {
                method: "POST",
                body: JSON.stringify({ name: "Katherine Johnson" }),
            }),
        );

        expect(created.status).toBe(201);
        await expect(created.json()).resolves.toMatchObject({
            name: "Katherine Johnson",
        });

        const rejected = await config.adapter.fetch(
            built.app,
            new Request("http://guri.test/users", {
                method: "POST",
                body: JSON.stringify({ name: "" }),
            }),
        );

        expect(rejected.status).toBe(400);
    });
});
