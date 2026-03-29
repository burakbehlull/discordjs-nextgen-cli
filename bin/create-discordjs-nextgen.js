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

async function main() {
  console.log("");
  p.intro(`${pc.bgBlue(pc.white(" NEXTGEN-CLI "))} ${pc.dim("Modern Discord.js Framework")}`);

  const projectName = await p.text({
    message: "Proje adını ne koyalım?",
    placeholder: "my-nextgen-bot",
    validate(value) {
      if (value.length === 0) return "Lütfen bir isim girin!";
      if (value.includes(" ")) return "Proje isminde boşluk olamaz.";
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel("İşlem iptal edildi.");
    process.exit(0);
  }

  const language = await p.select({
    message: "Hangi dili tercih edersiniz?",
    options: [
      { value: "js", label: "JavaScript", hint: "Esnek ve hızlı" },
      { value: "ts", label: "TypeScript", hint: "Tip güvenliği (Önerilen)" },
    ],
  });

  if (p.isCancel(language)) {
    p.cancel("İşlem iptal edildi.");
    process.exit(0);
  }

  const plugins = await p.multiselect({
    message: "Eklemek istediğiniz pluginleri seçin (Boşluk ile işaretle, Enter ile onayla):",
    options: [
      { value: "voice", label: "Voice Support", hint: "Müzik/Ses sistemleri için" },
    ],
    required: false,
  });

  if (p.isCancel(plugins)) {
    p.cancel("İşlem iptal edildi.");
    process.exit(0);
  }

  const template = await p.select({
    message: "Hangi şablonla başlamak istersiniz?",
    options: [
      { value: "starter", label: "Starter Kit", hint: "Sadece ana dosya (Minimum)" },
      { value: "basic", label: "Basic", hint: "Klasör yapısı & Basit komutlar" },
      { value: "advanced", label: "Advanced", hint: "Tam teşekküllü profesyonel yapı" },
    ],
  });

  if (p.isCancel(template)) {
    p.cancel("İşlem iptal edildi.");
    process.exit(0);
  }

  const s = p.spinner();
  s.start(pc.cyan("Dosyalar hazirlaniyor..."));

  const targetDir = path.resolve(process.cwd(), projectName);

  try {
    if (fs.existsSync(targetDir) && (await fsp.readdir(targetDir)).length > 0) {
      s.stop(pc.red("Hata!"));
      p.log.error(`Hata: '${projectName}' klasörü zaten var ve boş değil.`);
      process.exit(1);
    }

    if (!fs.existsSync(targetDir)) {
      await fsp.mkdir(targetDir, { recursive: true });
    }

    await generateProject(targetDir, { projectName, language, template, plugins });

    s.stop(pc.green("Proje başarıyla oluşturuldu!"));

    const shouldInstall = await p.confirm({
      message: "Bağımlılıkları şimdi kurmak ister misiniz?",
      initialValue: true,
    });

    if (shouldInstall) {
      const installSpinner = p.spinner();
      installSpinner.start(pc.yellow("Paketler yükleniyor..."));
      const success = await runInstall(targetDir);
      if (success) {
        installSpinner.stop(pc.green("Kurulum tamamlandı!"));
      } else {
        installSpinner.stop(pc.red("Kurulum başarısız oldu."));
      }
    }

    p.note(
      `cd ${projectName}\n${!shouldInstall ? "npm install\n" : ""}npm run dev`,
      "Sıradaki Adımlar"
    );

    p.outro(pc.blue("İyi kodlamalar! 🚀"));

  } catch (err) {
    s.stop(pc.red("Bir hata oluştu!"));
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
    scripts: config.language === "ts" ? {
      dev: "ts-node index.ts",
      start: "ts-node index.ts",
      build: "tsc"
    } : {
      dev: "node index.js",
      start: "node index.js"
    },
    dependencies: {
      "discordjs-nextgen": "latest",
      "dotenv": "^17.3.1"
    }
  };

  if (config.language === "ts") {
    pkg.devDependencies = {
      "@types/node": "^20.12.0",
      "ts-node": "^10.9.2",
      "typescript": "^5.4.5"
    };
    await writeFile(targetDir, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "node",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: "dist"
      }
    }, null, 2));
  }

  if (config.plugins.includes("voice")) {
    pkg.dependencies["discordjs-nextgen-voice"] = "latest";
  }

  await writeFile(targetDir, "package.json", JSON.stringify(pkg, null, 2));
  await writeFile(targetDir, ".gitignore", "node_modules\n.env\ndist\n");
  await writeFile(targetDir, ".env", "TOKEN=YOUR_BOT_TOKEN_HERE");

  if (config.plugins.includes("voice")) {
    await injectVoicePlugin(targetDir, extension, config.template);
  }
}

async function injectVoicePlugin(targetDir, extension, template) {
  const entryPath = path.join(targetDir, `index.${extension}`);
  let content = await fsp.readFile(entryPath, "utf8");

  const importLine = `import { VoicePlugin } from "discordjs-nextgen-voice";`;
  const useLine = `\napp.use(new VoicePlugin());`;

  if (!content.includes(importLine)) {
    content = `${importLine}\n${content}`;
  }

  if (!content.includes("new VoicePlugin()")) {
    content = content.replace(/const app = new App\((\{[\s\S]*?\}|)\);/, (match) => `${match}\n${useLine}`);
  }

  await fsp.writeFile(entryPath, content, "utf8");

  if (template !== "starter") {
    const cmdCode = `export default {\n  name: "join",\n  description: "Sese girer.",\n  run: async (ctx) => {\n    await ctx.voice.join({ channelId: ctx.member.voice.channelId });\n  }\n};`;
    await writeFile(targetDir, "commands/prefix/join." + extension, cmdCode);
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
    } else {
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
}

async function writeFile(baseDir, relPath, content) {
  const fullPath = path.join(baseDir, relPath);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, content, "utf8");
}

async function runInstall(targetDir) {
  const result = spawnSync("npm", ["install"], { cwd: targetDir, stdio: "inherit", shell: true });
  return result.status === 0;
}

main();
