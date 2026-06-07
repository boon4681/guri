import type { Services } from "guri";

export const init = () => {
    return { a: 5 }
}

export const teardown = (services: Services) => {
    void services.a // close DB pools, flush telemetry, etc.
}