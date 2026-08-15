const args = process.argv.slice(2);
if (args[0] === "--help") {
  console.log("cli-example — a Knot-executed command");
  process.exit(0);
}
console.log(`cli-example received: ${args.join(" ") || "(no args)"}`);
