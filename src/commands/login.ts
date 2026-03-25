import { Command } from "commander";
import enquirer from "enquirer";
import { KumaClient } from "../client.js";
import { saveConfig } from "../config.js";
import { success, error, isJsonMode, jsonOut } from "../utils/output.js";
import { handleError } from "../utils/errors.js";
import chalk from "chalk";

const { prompt } = enquirer as any;

export function loginCommand(program: Command): void {
  program
    .command("login <url>")
    .description(
      "Authenticate with an Uptime Kuma instance and save the session token locally"
    )
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--username <username>", "Username (non-interactive)")
    .option("--password <password>", "Password (non-interactive)")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma login https://kuma.example.com")}
  ${chalk.cyan("kuma login https://kuma.example.com --username admin --password secret")}
  ${chalk.cyan("kuma login https://kuma.example.com --json")}

${chalk.dim("Notes:")}
  Credentials are never stored — only the session token is saved.
  Token location: run ${chalk.cyan("kuma status")} to see the config path.
`
    )
    .action(async (url: string, opts: { json?: boolean; username?: string; password?: string }) => {
      const json = isJsonMode(opts);

      try {
        // Normalize URL
        const normalizedUrl = url.replace(/\/$/, "");

        // Fix #2: Warn when connecting over plain HTTP — credentials will be in cleartext
        if (!normalizedUrl.startsWith("https://")) {
          if (json) {
            console.log(JSON.stringify({
              warning: "Connecting over HTTP. Credentials will be transmitted in cleartext. Use HTTPS in production."
            }));
          } else {
            console.warn(chalk.yellow(
              "⚠️  Warning: connecting over HTTP. Your credentials will be sent in cleartext.\n" +
              "   Use https:// in production environments."
            ));
          }
        }

        let username: string;
        let password: string;

        if (opts.username && opts.password) {
          username = opts.username;
          password = opts.password;
        } else {
          const answers = await prompt([
            ...(!opts.username
              ? [{ type: "input", name: "username", message: "Username:" }]
              : []),
            ...(!opts.password
              ? [{ type: "password", name: "password", message: "Password:" }]
              : []),
          ]);
          username = opts.username ?? answers.username;
          password = opts.password ?? answers.password;
        }

        const client = new KumaClient(normalizedUrl);
        await client.connect();

        const result = await client.login(username, password);
        client.disconnect();

        if (!result.ok || !result.token) {
          const msg = result.msg ?? "Login failed";
          if (json) {
            jsonOut({ error: msg });
          }
          error(msg);
          process.exit(1);
        }

        saveConfig({ url: normalizedUrl, token: result.token });

        if (json) {
          jsonOut({ url: normalizedUrl, username });
        }

        success(`Logged in as ${username} → ${normalizedUrl}`);
      } catch (err) {
        handleError(err, opts);
      }
    });
}
