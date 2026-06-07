export interface User {
    id: string;
    name: string;
}

export interface Post {
    id: string;
    userId: string;
    title: string;
}

export const users: User[] = [
    { id: "1", name: "Ada Lovelace" },
    { id: "2", name: "Grace Hopper" },
];

export const posts: Post[] = [
    { id: "first", userId: "1", title: "Notes on the engine" },
    { id: "compiler", userId: "2", title: "The first bug report" },
];

export function listUsers(): User[] {
    return users;
}

export function findUser(id: string): User | undefined {
    return users.find((user) => user.id === id);
}

export function findPost(userId: string, postId: string): Post | undefined {
    return posts.find((post) => post.userId === userId && post.id === postId);
}

export function createUser(name: string): User {
    const user = {
        id: String(users.length + 1),
        name,
    };
    users.push(user);
    return user;
}
