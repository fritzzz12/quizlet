import { randomBytes } from "crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";

const file = ".env";
const secretLine = `AUTH_SECRET=${randomBytes(32).toString("hex")}`;

if (!existsSync(file)) {
  writeFileSync(file, `${secretLine}\n`);
} else {
  const text = readFileSync(file, "utf8");
  if (!/^AUTH_SECRET=\S+/m.test(text)) {
    if (/^AUTH_SECRET=\s*$/m.test(text)) writeFileSync(file, text.replace(/^AUTH_SECRET=\s*$/m, secretLine));
    else appendFileSync(file, `${text.endsWith("\n") || text.length === 0 ? "" : "\n"}${secretLine}\n`);
  }
}
