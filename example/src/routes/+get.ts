import type { Handle } from "./$types";

export const handle: Handle = (c) => {
    return c.json({
        ok: true,
        requestId: c.get("requestId"),
        appA: c.app.a,
        routes: ["GET /users", "POST /users", "GET /users/:id", "GET /users/:id/posts/:postId"],
    });
}
