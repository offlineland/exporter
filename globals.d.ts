declare var JSZip: typeof import('jszip/index.d.ts');
declare var Zod: typeof import('zod/lib/index.d.ts');
declare var csv_stringify_sync: typeof import('csv-stringify/sync');
declare var saveAs: typeof import('file-saver');
declare var redom: typeof import('redom');
declare var idb: typeof import('idb/build/index.d.ts');
type DBSchema = import('idb/build/index.d.ts').DBSchema;
type IDBPDatabase = import('idb/build/index.d.ts').IDBPDatabase;

declare var consoleref: window.console | undefined;
