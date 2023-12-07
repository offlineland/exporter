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


### What is Bun?
[Bun](https://bun.sh) is a "fast all-in-one JavaScript runtime". It's basically Node.js or Deno, except faster and way more convenient and has everything built-in

### What is Zod?
[Zod](https://zod.dev/) is a powerful parsing + validation library; ideally I'd use it to validate all incoming data, but manyland's api is so full of holes and exceptions that I don't want to have it fail mid-way, so the exporter is mostly archiving everything as-is.

### What is RE:DOM?
[RE:DOM](https://redom.js.org/) is a "tiny turboboosted javascript library for creation user interfaces" - it's basically React, except way more barebones and no JSX. I use it because I didn't want to add all the annoying react tooling and a heavy transpilation step, and the exporter really doesn't need much.

It's a bit unsightly right now because I wrote 99% of it in a very basic style because I couldn't get my editor to work the types out, sorry about that!


The other libs are pretty self-explanatory: `JSZip` for zipping, `csv-stringify` for generating the .csv files, `file-saver` to be able to download the zip, and `idb` as a lightweight wrapper around the awful IndexedDB api.
