import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { sessionFromEnv, type RuntimeSessionData } from "./session.js";

const data: RuntimeSessionData = sessionFromEnv();
const loader = new URL("./loader.js", import.meta.url);
register(loader, {
  parentURL: pathToFileURL("./"),
  data,
});
