# Repository Guidelines

## Project Structure & Module Organization
Core entry points live at the repository root. `service.ts` contains the `CashuWalletService` business logic, `cli.ts` wires the Bun CLI, and `index.ts` re-exports public symbols for consumers or the packaged binary (`cashu`). `mcp-server.ts` hosts the Model Context Protocol server integration, while `db.ts` manages SQLite helpers. Integration and regression specs reside in `library.test.ts`. Environment examples sit in `example.env`, and `README.md` documents wallet usage for reference.

## Build, Test & Development Commands
Install dependencies with `bun install` before running anything else. Execute `bun run index.ts -- --help` to list CLI capabilities, or call subcommands directly (e.g. `bun run index.ts mint 100`). Launch the MCP transport with `bun run mcp-server.ts`. Run the full test suite via `bun test`; pin an individual spec with `bun test library.test.ts`. Format code end-to-end using `bun run format`.

## Coding Style & Naming Conventions
This codebase targets TypeScript with Bun. Follow Prettier defaults (`bun run format`) for spacing, trailing commas, and semicolons; files use 2-space indentation. Prefer camelCase for variables and functions, PascalCase for classes, and suffix interfaces with `Result` or `Config` to match existing exports. Keep modules focused and co-locate helpers with their primary consumer unless multiple entry points require sharing.

## Testing Guidelines
Author Bun-powered tests alongside new features using `.test.ts` files next to the implementation or under the root when spanning multiple modules. Mirror CLI command names in describe blocks (`describe("mint", ...)`) so failures map back to user actions. Ensure tests cover both success and error paths for minting, sending, and MCP flows. Prior to opening a PR, run `bun test` locally and capture any newly added snapshots or fixtures.

## Commit & Pull Request Guidelines
Commit messages follow Conventional Commits as seen in history (`feat: output schema`, `chore(mcp,service): ...`). Scope changes when touching specific modules (`feat(ecash): ...`). Each PR should summarize behavior changes, list validation commands (`bun test`, manual CLI checks), and link related issues. Include screenshots or transcripts when UI-adjacent tooling (e.g., NWC clients) is impacted, and call out configuration updates affecting `.env` consumers.

## Configuration & Security Tips
Copy `example.env` to `.env` to override defaults such as `DEFAULT_MINT`, `AUTO_MINT_PAID_QUOTES`, or `CASHU_WALLET_DB`. Store wallet databases securely—leaked SQLite files expose spendable proofs. When testing against alternative mints or Nostr transports, prefer disposable credentials and clearly annotate any secrets you add so reviewers can sanitize them before merge.
