import { createServer } from "node:http";

const port = Number(process.env.PORT ?? "0");
const server = createServer((_req, res) => {
  res.setHeader("content-type", "text/plain");
  res.end("knot web-server example\n");
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    console.log(`listening on http://127.0.0.1:${address.port}`);
  }
  if (process.env.KNOT_EXAMPLE_ONCE === "1") {
    server.close();
  }
});
