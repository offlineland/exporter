# Offlineland.io's exporter thingy

`exporter.js` is a console snippet to export your account from [Manyland](https://manyland.com) (creations, collections, snaps, etc), and potentially import it back to [Offlineland.io](https://offlineland.io)



## For developers:

The actual work is done on the `exporter.ts` file. To set up a dev env:

- install Bun ([Bun](https://bun.sh)):
- install dependencies:
```bash
bun install
```
-  run the compiler in watch mode:
```bash
bun run dev
```

When copy-pasting the built exporter.js, you'll need to be careful not to copy the first two lines:
```js
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
```
Typescript really really wants to include them and has no option not to, but it doesn't work in browser.

(If you manage to have tsc pick up the type for Zod.infer without using the `import/export type ...` syntax, you're a god please help me)
