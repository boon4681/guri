import type { Services } from "@boon4681/giri";

export const init = () => {
    return { a: 5 }
}

export const teardown = (services: Services) => {
    void services.a // close DB pools, flush telemetry, etc.
}