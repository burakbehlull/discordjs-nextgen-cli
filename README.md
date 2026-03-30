# create-discordjs-nextgen

CLI generator for `discordjs-nextgen`.

## Usage

```bash
npx create-discordjs-nextgen my-bot
```

The CLI asks for:

- Language: `JavaScript` or `TypeScript`
- Plugins: `Voice`, `JSX`
- Template: `Starter Kit`, `Basic`, `Advanced`

## Templates

### Basic

Creates the smallest possible bot:

- entry file
- `.env`
- `package.json`

### Starter Kit

Creates a practical starter project based on the examples:

- `commands/prefix`
- `commands/slash`
- `commands/hybrid`
- `events`

### Advanced

Creates a fuller example structure:

- `commands`
- `events`
- `buttons`
- `modals`
- `selects`
- `config`
- `plugins`
- `middleware`

## Notes

- `Voice` adds `discordjs-nextgen-voice`
- `JSX` adds `discordjs-nextgen-jsx`, injects `app.use(new JSXPlugin())`, and creates one example prefix command
- TypeScript adds `ts-node`, `typescript`, `@types/node`
- Generated code follows the current `discordjs-nextgen` API
