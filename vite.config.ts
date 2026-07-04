/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  test: {
    // Game logic tests are pure functions; vite-plugin-solid would default to jsdom.
    environment: "node",
  },
});
