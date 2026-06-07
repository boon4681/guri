import type { Handle } from "./$types";
import { findUser } from "../../../db";

export const handle: Handle = (c) => {
    const user = findUser(c.params.id);
    if (!user) {
        return c.json({ message: "user not found" }, 404);
    }

    return c.json(user);
};
