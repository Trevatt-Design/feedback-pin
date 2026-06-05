import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const opts = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "FeedbackPin",
  outfile: "dist/feedback-pin.js",
  minify: !watch,
  sourcemap: watch,
  target: ["es2019"],
  legalComments: "none",
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log("watching widget src...");
} else {
  await esbuild.build(opts);
}
