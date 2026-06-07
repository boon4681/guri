import type { Handle } from "./$types";
import { findPost } from "$db";

export const handle: Handle = (c) => {
    const post = findPost(c.params.id, c.params.postId);
    if (!post) {
        return c.json({ message: "post not found" }, 404);
    }
    if (post.id == "a") {
        return c.json(["HI A!!", 5] as const)
    }
    return c.json(post);
}
