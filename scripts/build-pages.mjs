import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = resolve(root, ".pages-build");
await mkdir(scratch, { recursive: true });
const stage = await mkdtemp(resolve(scratch, "export-"));
if (isAbsolute(relative(scratch, stage)) || !relative(scratch, stage).startsWith("export-")) throw new Error("Invalid staging directory");
try {
  for (const entry of ["src", "public", "package.json", "tsconfig.json", "next.config.mjs", "postcss.config.mjs", "tailwind.config.ts"]) {
    await cp(resolve(root, entry), resolve(stage, entry), {
      recursive: true,
      filter: (name) => name !== resolve(root, "src/app/api"),
    });
  }
  await symlink(resolve(root, "node_modules"), resolve(stage, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const result = spawnSync(process.execPath, [resolve(stage, "node_modules/next/dist/bin/next"), "build"], {
    cwd: stage, stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_STATIC_PAGES: "1", NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? "/Portra" },
  });
  if (result.status !== 0) throw result.error ?? new Error("Static Next.js build failed");
  const output = resolve(root, "out");
  if (dirname(output) !== root || relative(root, output) !== "out") throw new Error("Invalid output directory");
  await rm(output, { recursive: true, force: true });
  await cp(resolve(stage, "out"), output, { recursive: true });
} finally {
  await rm(stage, { recursive: true, force: true });
}
