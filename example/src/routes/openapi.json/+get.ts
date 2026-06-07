import type { Handle } from "./$types";

export const openapi = false;

export const handle: Handle = (c) => {
    const doc = require("$guri/openapi.json");
    return c.json(doc);
};
