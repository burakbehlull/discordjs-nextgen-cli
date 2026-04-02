#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesRoot = path.resolve(__dirname, "..", "templates");
const argv = process.argv.slice(2);

async function main() {
  console.log("");
  p.intro(`${pc.bgBlue(pc.white(" NEXTGEN-CLI "))} ${pc.dim("Modern Discord.js Framework")}`);

  const cliProjectName = argv.find((arg) => !arg.startsWith("-"));
  const forceJsx = argv.includes("--jsx");

  const projectName = cliProjectName ?? await p.text({
    message: "Proje adini ne koyalim?",
    placeholder: "my-nextgen-bot",
    validate(value) {
      if (value.length === 0) return "Lutfen bir isim girin.";
      if (value.includes(" ")) return "Proje isminde bosluk olamaz.";
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel("Islem iptal edildi.");
    process.exit(0);
  }

  const language = await p.select({
    message: "Hangi dili tercih edersiniz?",
    options: [
      { value: "js", label: "JavaScript", hint: "Esnek ve hizli" },
      { value: "ts", label: "TypeScript", hint: "Tip guvenligi" },
    ],
  });

  if (p.isCancel(language)) {
    p.cancel("Islem iptal edildi.");
    process.exit(0);
  }

  const plugins = await p.multiselect({
    message: "Eklemek istediginiz pluginleri secin:",
    options: [
      { value: "voice", label: "Voice Support", hint: "Muzik ve ses sistemleri" },
      { value: "jsx", label: "JSX Support", hint: "discordjs-nextgen-jsx ile JSX komutlar" },
      { value: "cache", label: "Cache (Sade)", hint: "MemoryAdapter kullanır" },
      { value: "cache-redis", label: "Cache (with Redis)", hint: "RedisAdapter + ioredis kullanır" },
    ],
    initialValues: forceJsx ? ["jsx"] : [],
    required: false,
  });

  if (p.isCancel(plugins)) {
    p.cancel("Islem iptal edildi.");
    process.exit(0);
  }

  const template = await p.select({
    message: "Hangi sablonla baslamak istersiniz?",
    options: [
      { value: "starter", label: "Starter Kit", hint: "Minimum kurulum" },
      { value: "basic", label: "Basic", hint: "Basit komutlar ve olaylar" },
      { value: "advanced", label: "Advanced", hint: "Buttons, modals, selects dahil" },
    ],
  });

  if (p.isCancel(template)) {
    p.cancel("Islem iptal edildi.");
    process.exit(0);
  }

  const s = p.spinner();
  s.start(pc.cyan("Dosyalar hazirlaniyor..."));

  const targetDir = path.resolve(process.cwd(), projectName);

  try {
    if (fs.existsSync(targetDir) && (await fsp.readdir(targetDir)).length > 0) {
      s.stop(pc.red("Hata"));
      p.log.error(`'${projectName}' klasoru zaten var ve bos degil.`);
      process.exit(1);
    }

    if (!fs.existsSync(targetDir)) {
      await fsp.mkdir(targetDir, { recursive: true });
    }

    await generateProject(targetDir, { projectName, language, template, plugins });

    s.stop(pc.green("Proje basariyla olusturuldu."));

    const shouldInstall = await p.confirm({
      message: "Bagimliliklari simdi kurmak ister misiniz?",
      initialValue: true,
    });

    if (shouldInstall) {
      const installSpinner = p.spinner();
      installSpinner.start(pc.yellow("Paketler yukleniyor..."));
      const success = await runInstall(targetDir);
      if (success) {
        installSpinner.stop(pc.green("Kurulum tamamlandi."));
      } else {
        installSpinner.stop(pc.red("Kurulum basarisiz oldu."));
      }
    }

    const runCommand = language === "ts" ? "npm run dev" : "npm run dev";
    p.note(`cd ${projectName}\n${!shouldInstall ? "npm install\n" : ""}${runCommand}`, "Siradaki Adimlar");

    const pluginNotes = [];
    if (plugins.includes("jsx")) {
      pluginNotes.push(
        language === "ts"
          ? "JSX aktif: tsconfig.json yazildi, index dosyasina JSXPlugin eklendi, commands/prefix/hello.tsx olusturuldu."
          : "JSX aktif: jsconfig.json yazildi, index dosyasina JSXPlugin eklendi, commands/prefix/hello.jsx olusturuldu."
      );
    }
    if (plugins.includes("cache") || plugins.includes("cache-redis")) {
      const isRedis = plugins.includes("cache-redis");
      pluginNotes.push(
        isRedis
          ? "Cache (Redis) aktif: ioredis kuruldu, index dosyasina RedisAdapter eklendi."
          : "Cache (Sade) aktif: index dosyasina MemoryAdapter eklendi."
      );
      if (template === "advanced") {
        pluginNotes.push(`Advanced sablonu secildigi icin commands/prefix/money.${extension} ornek komutu eklendi.`);
      }
    }
    if (pluginNotes.length > 0) {
      p.note(pluginNotes.join("\n"), "Bilgi");
    }

    p.outro(pc.blue("Iyi kodlamalar."));
  } catch (err) {
    s.stop(pc.red("Bir hata olustu."));
    console.error(err);
    process.exit(1);
  }
}

async function generateProject(targetDir, config) {
  const extension = config.language === "ts" ? "ts" : "js";
  const templateDir = path.join(templatesRoot, config.template);

  await copyTemplateDirectory(templateDir, targetDir, {
    extension,
    language: config.language,
  });

  const pkg = {
    name: config.projectName,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: config.language === "ts"
      ? {
          dev: "ts-node index.ts",
          start: "ts-node index.ts",
          build: "tsc",
        }
      : {
          dev: "node index.js",
          start: "node index.js",
        },
    dependencies: {
      "discordjs-nextgen": "latest",
      "dotenv": "^17.3.1",
    },
  };

  if (config.language === "ts") {
    pkg.devDependencies = {
      "@types/node": "^20.12.0",
      "ts-node": "^10.9.2",
      "typescript": "^5.4.5",
    };
  }

  if (config.plugins.includes("voice")) {
    pkg.dependencies["discordjs-nextgen-voice"] = "latest";
  }

  if (config.plugins.includes("jsx")) {
    pkg.dependencies["discordjs-nextgen-jsx"] = "latest";
  }

  if (config.plugins.includes("cache") || config.plugins.includes("cache-redis")) {
    pkg.dependencies["discordjs-nextgen-cache"] = "latest";
    if (config.plugins.includes("cache-redis")) {
      pkg.dependencies["ioredis"] = "latest";
    }
  }

  await writeLanguageConfig(targetDir, config.language, config.plugins.includes("jsx"));
  await writeFile(targetDir, "package.json", JSON.stringify(pkg, null, 2));
  await writeFile(targetDir, ".gitignore", "node_modules\n.env\ndist\n");
  await writeFile(targetDir, ".env", "TOKEN=YOUR_BOT_TOKEN_HERE\n");

  if (config.plugins.includes("voice")) {
    await injectVoicePlugin(targetDir, extension, config.template);
  }

  if (config.plugins.includes("jsx")) {
    await injectJSXPlugin(targetDir, config.language);
  }

  if (config.plugins.includes("cache") || config.plugins.includes("cache-redis")) {
    const useRedis = config.plugins.includes("cache-redis");
    await injectCachePlugin(targetDir, extension, useRedis, config.template, config.language);
  }
}

async function writeLanguageConfig(targetDir, language, useJsx) {
  if (language === "ts") {
    const tsconfig = {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "node",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: "dist",
      },
      include: ["**/*"],
    };

    if (useJsx) {
      tsconfig.compilerOptions.jsx = "react-jsx";
      tsconfig.compilerOptions.jsxImportSource = "discordjs-nextgen-jsx";
    }

    await writeFile(targetDir, "tsconfig.json", JSON.stringify(tsconfig, null, 2));
    return;
  }

  if (useJsx) {
    await writeFile(targetDir, "jsconfig.json", JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "discordjs-nextgen-jsx",
      },
      include: ["**/*"],
    }, null, 2));
  }
}

async function injectVoicePlugin(targetDir, extension, template) {
  const entryPath = path.join(targetDir, `index.${extension}`);
  let content = await fsp.readFile(entryPath, "utf8");

  const importLine = `import { VoicePlugin } from "discordjs-nextgen-voice";`;

  if (!content.includes(importLine)) {
    content = `${importLine}\n${content}`;
  }

  if (!content.includes("new VoicePlugin()")) {
    content = content.replace(/const app = new App\((\{[\s\S]*?\}|)\);/, (match) => `${match}\n\napp.use(new VoicePlugin());`);
  }

  await fsp.writeFile(entryPath, content, "utf8");

  if (template !== "starter") {
    const cmdCode = `export default {\n  name: "join",\n  description: "Sese girer.",\n  run: async (ctx) => {\n    await ctx.voice.join({ channelId: ctx.member.voice.channelId });\n  }\n};\n`;
    await writeFile(targetDir, `commands/prefix/join.${extension}`, cmdCode);
  }
}

async function injectJSXPlugin(targetDir, language) {
  const entryExtension = language === "ts" ? "ts" : "js";
  const jsxExtension = language === "ts" ? "tsx" : "jsx";
  const entryPath = path.join(targetDir, `index.${entryExtension}`);
  let content = await fsp.readFile(entryPath, "utf8");

  const importLine = `import { JSXPlugin } from "discordjs-nextgen-jsx";`;

  if (!content.includes(importLine)) {
    content = `${importLine}\n${content}`;
  }

  if (!content.includes("new JSXPlugin()")) {
    content = content.replace(/const app = new App\((\{[\s\S]*?\}|)\);/, (match) => `${match}\n\napp.use(new JSXPlugin());`);
  }

  if (!content.includes(".prefix(")) {
    content = content.replace(
      /app\.setPresence\(/,
      `app.prefix({\n  folder: 'commands/prefix',\n  prefix: '.',\n});\n\napp.setPresence(`
    );
  }

  await fsp.writeFile(entryPath, content, "utf8");

  const jsxPrefixCommand = language === "ts"
    ? `import type { PrefixCommand } from 'discordjs-nextgen';\nimport { Container, TextDisplay } from 'discordjs-nextgen-jsx';\n\nconst hello: PrefixCommand = {\n  name: 'hello',\n  description: 'JSX example command',\n  run: async (ctx) => {\n    const card = (\n      <Container accentColor={0x5865f2}>\n        <TextDisplay content="Hello from JSX." />\n        <TextDisplay content={\`Author: \${ctx.user.username}\`} />\n      </Container>\n    );\n\n    await ctx.reply({\n      components: [card],\n    });\n  },\n};\n\nexport default hello;\n`
    : `import { Container, TextDisplay } from 'discordjs-nextgen-jsx';\n\nconst hello = {\n  name: 'hello',\n  description: 'JSX example command',\n  run: async (ctx) => {\n    const card = (\n      <Container accentColor={0x5865f2}>\n        <TextDisplay content="Hello from JSX." />\n        <TextDisplay content={\`Author: \${ctx.user.username}\`} />\n      </Container>\n    );\n\n    await ctx.reply({\n      components: [card],\n    });\n  },\n};\n\nexport default hello;\n`;

  await writeFile(targetDir, `commands/prefix/hello.${jsxExtension}`, jsxPrefixCommand);
}

async function injectCachePlugin(targetDir, extension, useRedis, template, language) {
  const entryPath = path.join(targetDir, `index.${extension}`);
  let content = await fsp.readFile(entryPath, "utf8");

  const adapterName = useRedis ? "RedisAdapter" : "MemoryAdapter";
  const importLine = `import { CachePlugin, ${adapterName} } from "discordjs-nextgen-cache";`;

  if (!content.includes(importLine)) {
    content = `${importLine}\n${content}`;
  }

  if (!content.includes("new CachePlugin")) {
    const pluginCode = useRedis
      ? `app.use(new CachePlugin({ adapter: new RedisAdapter() }));`
      : `app.use(new CachePlugin({ adapter: new MemoryAdapter() }));`;

    content = content.replace(/const app = new App\((\{[\s\S]*?\}|)\);/, (match) => `${match}\n\n${pluginCode}`);
  }

  await fsp.writeFile(entryPath, content, "utf8");

  if (template === "advanced") {
    const cmdCode = language === "ts"
      ? `import type { PrefixCommand } from 'discordjs-nextgen';\n\nconst money: PrefixCommand = {\n  name: 'money',\n  description: 'Cache ile bakiye sistemi.',\n  run: async (ctx) => {\n    const userId = ctx.user.id;\n    let user = await ctx.cache.user.get(userId) || { coins: 0 };\n    user.coins += 100;\n    await ctx.cache.user.set(userId, user);\n    await ctx.reply(\`100 coin eklendi! Mevcut bakiyen: \${user.coins}\`);\n  }\n};\n\nexport default money;\n`
      : `const money = {\n  name: 'money',\n  description: 'Cache ile bakiye sistemi.',\n  run: async (ctx) => {\n    const userId = ctx.user.id;\n    let user = await ctx.cache.user.get(userId) || { coins: 0 };\n    user.coins += 100;\n    await ctx.cache.user.set(userId, user);\n    await ctx.reply(\`100 coin eklendi! Mevcut bakiyen: \${user.coins}\`);\n  }\n};\n\nexport default money;\n`;

    await writeFile(targetDir, `commands/prefix/money.${extension}`, cmdCode);
  }
}

async function copyTemplateDirectory(sourceDir, targetDir, context) {
  if (!fs.existsSync(sourceDir)) return;
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const src = path.join(sourceDir, entry.name);
    const destName = entry.name.replace(/__EXT__/g, context.extension);
    const dest = path.join(targetDir, destName);

    if (entry.isDirectory()) {
      await fsp.mkdir(dest, { recursive: true });
      await copyTemplateDirectory(src, dest, context);
      continue;
    }

    let content = await fsp.readFile(src, "utf8");

    if (context.language === "ts") {
      content = content.replace(/\/\/ \[JS\][\s\S]*?\/\/ \[\/JS\]/g, "");
      content = content.replace(/\/\/ \[TS\]/g, "").replace(/\/\/ \[\/TS\]/g, "");
    } else {
      content = content.replace(/\/\/ \[TS\][\s\S]*?\/\/ \[\/TS\]/g, "");
      content = content.replace(/\/\/ \[JS\]/g, "").replace(/\/\/ \[\/JS\]/g, "");
    }

    content = content.replaceAll("__EXT__", context.extension);
    await fsp.writeFile(dest, content, "utf8");
  }
}

async function writeFile(baseDir, relPath, content) {
  const fullPath = path.join(baseDir, relPath);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, content, "utf8");
}

async function runInstall(targetDir) {
  const result = spawnSync("npm", ["install"], {
    cwd: targetDir,
    stdio: "inherit",
    shell: true,
  });

  return result.status === 0;
}

main();
