#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith("-")));
const projectArg = argv.find((arg) => !arg.startsWith("-"));
const yes = flags.has("--yes") || flags.has("-y");
const shouldInstall = !flags.has("--no-install");
const explicitInstall = flags.has("--install");
const cwd = process.cwd();
const packageManager = detectPackageManager();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesRoot = path.resolve(__dirname, "..", "templates");

const LANGUAGE_OPTIONS = [
  { label: "JavaScript", value: "js" },
  { label: "TypeScript", value: "ts" },
];

const TEMPLATE_OPTIONS = [
  { label: "Starter Kit", value: "starter" },
  { label: "Basic", value: "basic" },
  { label: "Advanced", value: "advanced" },
];

const PLUGIN_OPTIONS = [
  { label: "Voice", value: "voice" },
];

main();

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const projectName = await resolveProjectName(rl);
    const targetDir = path.resolve(cwd, projectName);

    await ensureTargetDirectory(targetDir);

    const config = await resolveGeneratorConfig(rl);

    await generateProject(targetDir, {
      projectName,
      ...config,
    });

    console.log("");
    console.log(`Project created in ${targetDir}`);

    const installNow = explicitInstall || (shouldInstall && (yes || await confirmInstall(rl)));
    if (installNow) {
      runInstall(targetDir, packageManager);
    }

    printNextSteps(projectName, installNow, packageManager, config.language);
  } catch (error) {
    console.error("");
    console.error(`[create-discordjs-nextgen] ${error.message}`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

async function resolveProjectName(rl) {
  if (projectArg) {
    return sanitizeProjectName(projectArg);
  }

  if (yes) {
    return "discordjs-nextgen-bot";
  }

  const answer = (await rl.question("Project name: ")).trim();
  return sanitizeProjectName(answer || "discordjs-nextgen-bot");
}

async function resolveGeneratorConfig(rl) {
  if (yes) {
    return {
      language: "js",
      plugins: [],
      template: "starter",
    };
  }

  console.log("");
  const language = await promptSingleSelect(rl, "Dil Sec", LANGUAGE_OPTIONS);

  console.log("");
  const plugins = await promptMultiSelect(rl, "Plugin Sec", PLUGIN_OPTIONS);

  console.log("");
  const template = await promptSingleSelect(rl, "Template Sec", TEMPLATE_OPTIONS);

  return { language, template, plugins };
}

async function promptSingleSelect(rl, title, options) {
  console.log(`${title}:`);
  for (const [index, option] of options.entries()) {
    console.log(`  ${index + 1}. ${option.label}`);
  }

  while (true) {
    const answer = (await rl.question("> ")).trim();
    const selected = Number.parseInt(answer, 10);

    if (Number.isInteger(selected) && selected >= 1 && selected <= options.length) {
      return options[selected - 1].value;
    }

    console.log("Gecerli bir secim yap. Ornek: 1");
  }
}

async function promptMultiSelect(rl, title, options) {
  console.log(`${title}:`);
  for (const [index, option] of options.entries()) {
    console.log(`  ${index + 1}. ${option.label}`);
  }
  console.log("  Enter ile gec veya birden fazla secim icin 1,3 yaz.");

  while (true) {
    const answer = (await rl.question("> ")).trim();

    if (!answer) {
      return [];
    }

    const values = answer
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value));

    const uniqueValues = [...new Set(values)];
    const valid = uniqueValues.every((value) => value >= 1 && value <= options.length);

    if (uniqueValues.length > 0 && valid) {
      return uniqueValues.map((value) => options[value - 1].value);
    }

    console.log("Gecerli secimler gir. Ornek: 1 veya 1,2");
  }
}

function sanitizeProjectName(name) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

  if (!normalized) {
    throw new Error("Project name is empty after sanitizing.");
  }

  return normalized;
}

async function ensureTargetDirectory(targetDir) {
  if (fs.existsSync(targetDir)) {
    const existingFiles = await fsp.readdir(targetDir);
    if (existingFiles.length > 0) {
      throw new Error(`Target directory already exists and is not empty: ${targetDir}`);
    }
    return;
  }

  await fsp.mkdir(targetDir, { recursive: true });
}

async function generateProject(targetDir, config) {
  const extension = config.language === "ts" ? "ts" : "js";
  const templateDir = path.join(templatesRoot, config.template);

  await copyTemplateDirectory(templateDir, targetDir, {
    extension,
    language: config.language,
  });

  await writeSharedFiles(targetDir, config);

  if (config.language === "ts") {
    await writeTsConfig(targetDir);
  }

  // Smart Plugin Injection
  for (const plugin of config.plugins) {
    if (plugin === "voice") {
       await addVoicePlugin(targetDir, config);
    }
    // Add other plugin logic here
  }
}

async function writeTsConfig(targetDir) {
  const tsconfig = {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "node",
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      strict: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: ".",
    },
    include: ["**/*.ts"],
    exclude: ["node_modules"],
  };

  await writeFile(targetDir, "tsconfig.json", JSON.stringify(tsconfig, null, 2));
}

async function writeSharedFiles(targetDir, config) {
  await writeFile(targetDir, "package.json", createPackageJson(config));
  await writeFile(targetDir, ".gitignore", "node_modules\n.env\ndist\n");
  await writeFile(targetDir, ".env", "TOKEN=your_discord_bot_token\n");
  await writeFile(targetDir, ".env.example", "TOKEN=your_discord_bot_token\n");
  await writeFile(targetDir, "README.md", createReadme(config));
}

async function writeFile(baseDir, relativePath, contents) {
  const filePath = path.join(baseDir, relativePath);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, contents, "utf8");
}

async function copyTemplateDirectory(sourceDir, targetDir, context) {
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const outputName = entry.name.replace(/__EXT__/g, context.extension);
    const targetPath = path.join(targetDir, outputName);

    if (entry.isDirectory()) {
      await fsp.mkdir(targetPath, { recursive: true });
      await copyTemplateDirectory(sourcePath, targetPath, context);
      continue;
    }

    const raw = await fsp.readFile(sourcePath, "utf8");
    const rendered = raw
      .replaceAll("__EXT__", context.extension)
      .replaceAll("__LANG__", context.language);

    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.writeFile(targetPath, rendered, "utf8");
  }
}

async function addVoicePlugin(targetDir, config) {
  const extension = config.language === "ts" ? "ts" : "js";
  const entryPath = path.join(targetDir, `index.${extension}`);

  let entry = await fsp.readFile(entryPath, "utf8");
  
  // Smart injection
  const importStatement = `import { VoicePlugin } from "discordjs-nextgen-voice";`;
  const useStatement = `app.use(new VoicePlugin());`;

  if (!entry.includes(importStatement)) {
    // Insert after the last import line or at the top
    const lines = entry.split("\n");
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("import ")) {
            lastImportIndex = i;
        }
    }
    
    if (lastImportIndex !== -1) {
        lines.splice(lastImportIndex + 1, 0, importStatement);
    } else {
        lines.unshift(importStatement);
    }
    entry = lines.join("\n");
  }

  if (!entry.includes(useStatement)) {
    // Insert after app initialization
    entry = entry.replace(
        /const app = new App\(\{[\s\S]*?\}\);/,
        (match) => `${match}\n\n${useStatement}`
    );
  }

  await fsp.writeFile(entryPath, entry, "utf8");

  // Add voice command if not basic template
  if (config.template !== "basic") {
    const voiceCommandPath = path.join("commands", "prefix", `join.${extension}`);
    await writeFile(targetDir, voiceCommandPath, createVoiceCommand());
  }
}

function createPackageJson(config) {
  const pkg = {
    name: config.projectName,
    version: "1.0.0",
    private: true,
    type: "module",
    description: "Discord bot generated with create-discordjs-nextgen",
    scripts: createScripts(config.language),
    dependencies: createDependencies(config.plugins),
  };

  if (config.language === "ts") {
    pkg.devDependencies = {
      "@types/node": "^20.12.0",
      "ts-node": "^10.9.2",
      "typescript": "^5.4.5",
    };
  }

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function createScripts(language) {
  if (language === "ts") {
    return {
      dev: "ts-node index.ts",
      start: "ts-node index.ts",
      build: "tsc",
    };
  }

  return {
    dev: "node index.js",
    start: "node index.js",
  };
}

function createDependencies(plugins) {
  const dependencies = {
    "discordjs-nextgen": "latest",
    "dotenv": "^17.3.1",
  };

  if (plugins.includes("voice")) {
    dependencies["discordjs-nextgen-voice"] = "latest";
  }

  return dependencies;
}

function createReadme(config) {
  const lines = [
    `# ${config.projectName}`,
    "",
    "This project was generated with `create-discordjs-nextgen`.",
    "",
    "## Selected Options",
    "",
    `- Language: ${config.language === "ts" ? "TypeScript" : "JavaScript"}`,
    `- Template: ${labelForValue(TEMPLATE_OPTIONS, config.template)}`,
    `- Plugins: ${config.plugins.length ? config.plugins.map((plugin) => labelForValue(PLUGIN_OPTIONS, plugin)).join(", ") : "None"}`,
    "",
    "## Setup",
    "",
    "```bash",
    `${packageManager === "npm" ? "npm install" : `${packageManager} install`}`,
    "```",
    "",
    "Fill `TOKEN` in `.env`, then run:",
    "",
    "```bash",
    packageManager === "npm"
      ? (config.language === "ts" ? "npm run dev" : "npm run dev")
      : `${packageManager} dev`,
    "```",
    "",
  ];

  if (config.template !== "basic") {
    lines.push("## Structure", "");
    lines.push("- `commands/prefix`: prefix commands");
    lines.push("- `commands/slash`: slash commands");
    lines.push("- `commands/hybrid`: hybrid commands");
    lines.push("- `events`: framework events");
  }

  if (config.template === "advanced") {
    lines.push("- `config`: app configuration");
    lines.push("- `plugins`: plugin registration");
    lines.push("- `middleware`: middleware examples");
    lines.push("- `buttons`, `modals`, `selects`: interaction examples");
  }

  return `${lines.join("\n")}\n`;
}

function createVoiceCommand() {
  const body = `const joinCommand = {
  name: "join",
  description: "Join a voice channel",
  run: async (ctx) => {
    await ctx.voice.join({
      channelId: "VOICE_CHANNEL_ID",
    });

    await ctx.reply("Joined the voice channel.");
  },
};

export default joinCommand;
`;

  return body;
}

async function confirmInstall(rl) {
  const answer = (await rl.question("Install dependencies now? (Y/n): ")).trim().toLowerCase();
  return answer === "" || answer === "y" || answer === "yes";
}

function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent || "";

  if (userAgent.startsWith("pnpm")) {
    return "pnpm";
  }

  if (userAgent.startsWith("yarn")) {
    return "yarn";
  }

  if (userAgent.startsWith("bun")) {
    return "bun";
  }

  return "npm";
}

function runInstall(targetDir, manager) {
  const command = manager === "yarn" ? "yarn" : manager;

  console.log("");
  console.log(`Installing dependencies with ${manager}...`);

  const result = spawnSync(command, ["install"], {
    cwd: targetDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error("Dependency installation failed.");
  }
}

function printNextSteps(projectName, installNow, manager, language) {
  const installCommand = manager === "npm" ? "npm install" : `${manager} install`;
  const runCommand = manager === "npm" ? "npm run dev" : `${manager} dev`;

  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${projectName}`);

  if (!installNow) {
    console.log(`  ${installCommand}`);
  }

  console.log("  Fill TOKEN in .env");
  console.log(`  ${runCommand}`);

  if (language === "ts") {
    console.log("  Optionally run npm run build to emit dist/");
  }

  console.log("");
}

function labelForValue(options, value) {
  return options.find((option) => option.value === value)?.label ?? value;
}
