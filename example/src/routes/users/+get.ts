import type { Handle } from "guri";
import { listUsers } from "../../db";

export const handle: Handle = (c) => {
    return c.json({
        requestId: c.get("requestId"),
        users: listUsers(),
    });
}
