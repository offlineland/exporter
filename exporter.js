(async () => {
    const version = "10";
    const RANDOM_ID_FOR_THE_PEOPLE_LATE = "65e0ab7a46e5995f5b00230676";
    if (window.location.protocol === "http:") {
        if (confirm("Redirecting to https...")) {
            window.location.href = `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
        }
        else {
            return;
        }
    }
    if (!window.console) {
        alert("You might have an ablocker that will break things! If you see an error, try disabling it (or switch to ublock origin, that one seems to work fine)");
        // add stubs anyway
        // @ts-ignore
        window.console = {
            log: () => { },
            info: () => { },
            warn: () => { },
            error: () => { },
            debug: () => { },
            time: () => { },
            timeEnd: () => { },
            timeLog: () => { },
        };
    }
    // #region boilerplate
    const log = typeof consoleref !== 'undefined' ? consoleref.log : console.log;
    log("loading... (this can take around 30 seconds if you're on slow internet!)");
    eval(await (await fetch("https://redom.js.org/redom.min.js", { cache: "force-cache" })).text());
    eval(await (await fetch("https://unpkg.com/zod@3.22.0/lib/index.umd.js", { cache: "force-cache" })).text());
    eval(await (await fetch("https://cdn.jsdelivr.net/npm/idb@7/build/umd.js", { cache: "force-cache" })).text());
    eval(await (await fetch("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", { cache: "force-cache" })).text());
    // https://csv.js.org/stringify/api/sync/
    eval(await (await fetch("https://cdn.jsdelivr.net/npm/csv-stringify@6.4.4/dist/iife/sync.js", { cache: "force-cache" })).text());
    eval(await (await fetch("https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js", { cache: "force-cache" })).text());
    log("loading... done!");
    const { el, text, mount, setAttr } = redom;
    const z = Zod;
    const sleep = (ms = 1) => new Promise(res => setTimeout(res, ms));
    const dateFromObjectId = (objectId) => new Date(parseInt(objectId.substring(0, 8), 16) * 1000);
    const retryOnThrow = async (fn, sleepMs = 1000, maxAttempts = 3) => {
        const errors = [];
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            }
            catch (e) {
                console.warn("retry: function failed! Attempts left:", maxAttempts - attempt);
                errors.push(e);
                await sleep(sleepMs);
            }
        }
        log("retry: all attemps failed!", errors);
        throw errors.at(-1);
    };
    // TODO migrate everything to these helpers
    const api_getJSON = async (url) => await (await fetch(url)).json();
    const db_makeSetGet = (storeId) => {
        const set = async (key, data) => await db.put(storeId, data, key);
        const get = async (key) => await db.get(storeId, key);
        return [set, get];
    };
    const db_makeSetGetWithStaticKey = (storeId, key) => {
        const set = async (data) => await db.put(storeId, data, key);
        const get = async () => await db.get(storeId, key);
        return [set, get];
    };
    log("creating db");
    const db = await idb.openDB("mlexporter", 3, {
        upgrade(db, oldVersion, newVersion, tx) {
            console.log("upgrading db from", oldVersion, "to", newVersion);
            if (oldVersion < 1) {
                db.createObjectStore('misc-data');
                db.createObjectStore('inventory-creations');
                db.createObjectStore('inventory-collections');
                db.createObjectStore('snapshots-data');
                db.createObjectStore('snapshots-image');
                db.createObjectStore('creations-data-def');
                db.createObjectStore('creations-data-painter');
                db.createObjectStore('creations-image');
                db.createObjectStore('creations-stats');
                db.createObjectStore('creations-queue');
                db.createObjectStore('mifts-public');
                db.createObjectStore('mifts-private');
                db.createObjectStore('holders-content');
                db.createObjectStore('multis-content');
                db.createObjectStore('body-motions');
            }
            if (oldVersion < 2) {
                db.createObjectStore('public-creations-downloaded-prefixes');
                db.createObjectStore('public-creations');
            }
            if (oldVersion < 3) {
                log("clearing saved creation data");
                tx.objectStore('creations-data-def').clear();
            }
        }
    });
    log("creating db OK");
    // @ts-ignore Adding it to the global for debugging
    window.db = db;
    const SLEEP_CREATIONDL_API_SUBCONTENT = 1;
    const SLEEP_CREATIONDL_API_STATS = 1;
    const SLEEP_CREATIONDL_API_PAINTER_DATA = 1;
    // These are off of a CDN
    const SLEEP_SNAP_DL = 1;
    const SLEEP_CREATIONDL_CDN = 1;
    /**
     * Check if a creation is in universe search by fetching the list of public items that start with the same prefix from offlineland.io
     */
    const isCreationPublic = async (creationId) => {
        const PREFIX_LENGTH = 3;
        const prefix = creationId.substring(0, PREFIX_LENGTH);
        // Download the json file if we don't have it yet
        const prefixFileWasDownloaded = await db.get("public-creations-downloaded-prefixes", prefix);
        if (prefixFileWasDownloaded !== true) {
            const prevStatusText = status.textContent;
            status.textContent = prevStatusText + ` (checking public creations ${prefix}...)`;
            console.time(`Downloading creation Ids ${prefix}`);
            const ids = await fetch(`https://archival.offlineland.io/static/creations/by-prefix/${PREFIX_LENGTH}/${prefix}.json`)
                .then(res => {
                if (res.ok)
                    return res.json();
                else
                    throw new Error(`Request error ${res.status} ${res.statusText}.`);
            })
                .catch(e => {
                console.warn("Error while downloading the list public creations! Skipping...", e);
                return [];
            });
            console.timeEnd(`Downloading creation Ids ${prefix}`);
            console.time(`Storing creation Ids ${prefix}`);
            const tx = db.transaction('public-creations', "readwrite");
            await Promise.all(ids.map(id => tx.store.put(true, id)));
            console.timeLog(`Storing creation Ids ${prefix}`, "closing transaction");
            await tx.done;
            console.timeEnd(`Storing creation Ids ${prefix}`);
            await db.put("public-creations-downloaded-prefixes", true, prefix);
            status.textContent = prevStatusText;
        }
        return db.get("public-creations", creationId);
    };
    const STATE_PROGRESS_SNAPS = "snapAlbum";
    const STATE_PROGRESS_COLLECTIONS = "collectionsTab3";
    const STATE_PROGRESS_CREATIONS = "creationsTab3";
    const STATE_PROGRESS_BIN = "creationsInBin";
    const getProgress = async (stateName) => (await db.get('misc-data', `state2-${stateName}`)) || { lastIndex: 0, isDone: false };
    // #endregion boilerplate
    // #region UI
    const status = text("waiting");
    const mkNumberStat = (init) => {
        const txtNode = text(String(init));
        let value = init;
        const update = (fn) => {
            value = fn(value);
            txtNode.textContent = String(value);
        };
        return { el: txtNode, update };
    };
    // NOTE: Ideally we'd use a Re:dom component here instead of putting everything into consts,
    // but I haven't figured out how to make it work with my typechecker setup so bear with me
    const status_totalSnapsFound = mkNumberStat(await db.count("snapshots-data"));
    const status_currentMiftsPublicSaved = mkNumberStat(await db.count("mifts-public"));
    const status_currentMiftsPrivateSaved = mkNumberStat(await db.count("mifts-private"));
    const status_totalSavedCreations = mkNumberStat(await db.count("creations-data-def"));
    const status_creationsInQueue = mkNumberStat(await db.count("creations-queue"));
    const status_totalCollectionsFound = mkNumberStat(await db.count("inventory-collections"));
    const status_totalPublicCollectionsFound = mkNumberStat(0);
    const status_totalCreationsFound = mkNumberStat(await db.count("inventory-creations"));
    const progressSnaps = await getProgress(STATE_PROGRESS_SNAPS);
    const progressCreations = await getProgress(STATE_PROGRESS_CREATIONS);
    const progressCollections = await getProgress(STATE_PROGRESS_COLLECTIONS);
    console.log({ progressSnaps, progressCreations, progressCollections });
    const btn_queueEnabled = el("input", { type: "checkbox", checked: false });
    const btn_start = el("button.okButton", ["Start exporter"]);
    class App {
        el;
        constructor() {
            this.el = el("div.contentPart", [
                el("div", { style: "padding-bottom: 2em;" }, [
                    el("h1", "offlineland.io's exporter finisher"),
                    el("div", "You're late, manyland is down already!! This'll allow you to finish a previously-started export, but not much else"),
                ]),
                el("div", { style: "font-family: initial; font-size: initial; text-transform: initial; background-color: rgb(208,188,178); color: black; border-radius: 5px; padding: 30px;" }, [
                    el("div", [
                        el("ul", [
                            el("li", el("label", [btn_queueEnabled, "Things in multis, holders, and body motions (this can take a very long time!)"])),
                        ])
                    ]),
                    el("div", { style: "padding: 1em; text-align: center;" }, [
                        btn_start,
                    ]),
                    el("div", { style: "padding-top: 1em;" }, [
                        el("p.text-left", ["status:", status]),
                        el("ul", [
                            el("li", ["Snaps: ", status_totalSnapsFound.el]),
                            el("li", ["Mifts (public): ", status_currentMiftsPublicSaved.el]),
                            el("li", ["Mifts (private): ", status_currentMiftsPrivateSaved.el]),
                            el("li", ["Inventory (creations): ", status_totalCreationsFound.el]),
                            el("li", ["Inventory (collects): ", status_totalCollectionsFound.el, " (skipped public creations: ", status_totalPublicCollectionsFound.el, " )"]),
                            el("li", ["Total saved items: ", status_totalSavedCreations.el]),
                            el("li", ["Remaining items in multis/holders/bodies to download: ", status_creationsInQueue.el]),
                        ]),
                    ]),
                    el("div", { style: "padding-top: 2em; font-size: 12px;" }, [
                        el("p", { style: "margin-bottom: 0px" }, [
                            "Note: this can take a while! To speed up things, collected public creations (those in the universe search) are not downloaded. They'll appear in your inventory on offlineland.io though!"
                        ]),
                        el("p", { style: "margin-top: 0px" }, [
                            "(version: ", version, ")",
                        ])
                    ])
                ])
            ]);
        }
    }
    const root = new App();
    const _root = el("div#alertDialog", root, {
        style: {
            "display": "flex",
            "justify-content": "space-around",
            "position": "unset",
            "width": "50vw",
            "height": "100vh",
            "margin-top": "2em",
            "margin-bottom": "2em",
            "margin-left": "auto",
            "margin-right": "auto",
            "padding": "1em",
            "font-size": "12px",
        }
    });
    // Remove everything in the museum then mount our app on it
    document.body.innerHTML = '';
    mount(document.body, _root);
    // #endregion UI
    // #region profile
    const [store_setProfileData, store_getProfileData] = db_makeSetGetWithStaticKey('misc-data', 'profile-data');
    const [store_setProfileTopCreations, store_getProfileTopCreations] = db_makeSetGetWithStaticKey('misc-data', 'profile-top-creations');
    const store_addCreationDef = async (creationId, creationDef) => await db.put('creations-data-def', creationDef, creationId);
    const store_getCreationDef = async (creationId) => await db.get('creations-data-def', creationId);
    const store_addCreationImage = async (creationId, blob) => await db.put('creations-image', blob, creationId);
    const store_getCreationImage = async (creationId) => await db.get('creations-image', creationId);
    const [store_setHolderContent, store_getHolderContent] = db_makeSetGet('holders-content');
    const [store_setMultiData, store_getMultiData] = db_makeSetGet('multis-content');
    const [store_setBodyMotions, store_getBodyMotions] = db_makeSetGet('body-motions');
    const store_setCreationStats = async (creationId, stats) => await db.put('creations-stats', stats, creationId);
    const store_getCreationStats = async (creationId) => await db.get('creations-stats', creationId);
    const [store_setCreationPainterData, store_getCreationPainterData] = db_makeSetGet('creations-data-painter');
    const store_getAllMifts = async (priv) => await db.getAll(priv ? 'mifts-private' : 'mifts-public');
    // Try figuring out our own ID from saved data because of course this is the one thing I did not save
    const findOurIdFromArchivedData = async () => {
        // Try to find it from received mifts
        for (const mift of (await store_getAllMifts(true))) {
            if (mift.toId)
                return mift.toId;
        }
        for (const mift of (await store_getAllMifts(false))) {
            if (mift.toId)
                return mift.toId;
        }
        // Try to find it from saved own creations
        if (!ourId) {
            const allOwnCreations = await db.getAllKeys("inventory-creations");
            for (const id of allOwnCreations) {
                const def = await store_getCreationDef(id);
                if (def && def.creator) {
                    return def.creator;
                }
            }
        }
    };
    let ourId = (await findOurIdFromArchivedData()) || RANDOM_ID_FOR_THE_PEOPLE_LATE;
    let couldFindOurId = ourId === RANDOM_ID_FOR_THE_PEOPLE_LATE;
    const creationIsInCreatedTab = async (id) => (await db.getKey("inventory-collections", id)) !== undefined;
    if ((await db.count("inventory-collections")) === 0) {
        alert("It seems like you didn't start any exports previously! Manyland is closed now, so new exports won't work. You can still try to run this, though!");
    }
    const api_getHolderContent = async (id) => await api_getJSON(`https://archival.offlineland.io/static/creations/holdercontents/${id}.json`);
    const api_getBodyMotions = async (id) => await api_getJSON(`https://archival.offlineland.io/static/creations/bodymotions/${id}.json`);
    const api_getMultiData = async (id) => await api_getJSON(`https://archival.offlineland.io/static/creations/multicontents/${id}.json`);
    const api_getCreationStats = async (id) => await api_getJSON(`https://manyland.com/j/i/st/${id}`); // TODO (?)
    const api_getCreationPainterData = async (id) => await api_getJSON(`https://archival.offlineland.io/creations/painter-data/${id}`);
    const api_getSnapFromCode = async (shortCode) => await api_getJSON(` https://archival.offlineland.io/snapLoc/${shortCode}`);
    const store_addToQueue = async (creationId) => {
        status_creationsInQueue.update(v => v + 1);
        await db.put("creations-queue", null, creationId);
    };
    // Wraps the real function in a try/catch block to keep the control flow simple
    const saveCreation = async (creationId) => {
        try {
            return await saveCreation_(creationId);
        }
        catch (e) {
            console.warn(`Error while downloading creation ${creationId}! Skipping, please re-run the exporter to retry downloading it!`);
        }
    };
    const saveCreation_ = async (creationId) => {
        if ((await store_getCreationImage(creationId)) == undefined) {
            try {
                const img = await retryOnThrow(() => fetch(`https://archival.offlineland.io/creations/sprite/${creationId}`).then(res => res.blob()));
                await store_addCreationImage(creationId, img);
            }
            catch (e) {
                console.warn(`Error downloading creation sprite ${creationId}, skipping`);
            }
        }
        if ((await store_getCreationDef(creationId)) == undefined) {
            const res = await retryOnThrow(() => fetch(`https://archival.offlineland.io/creations/def/${creationId}`));
            // NOTE: 404 errors will make `fetch` throw because the server doesn't set the proper CORS headers on 404s, and CORS errors are "Network errors"
            if (!res.ok) {
                console.warn(`Error downloading creation data ${creationId}! Server says: ${res.status} ${res.statusText}. Skipping`);
                return;
            }
            const def = await res.json();
            if (def.base === "HOLDER" && (await store_getHolderContent(creationId)) == undefined) {
                log(`Creation "${def.name}" is a holder, fetching content`);
                const data = await retryOnThrow(() => api_getHolderContent(def.id));
                for (const content of data.contents) {
                    await store_addToQueue(content.itemId);
                }
                await store_setHolderContent(def.id, data);
                await sleep(SLEEP_CREATIONDL_API_SUBCONTENT);
                log(`Creation "${def.name}" is a holder, fetching content done`);
            }
            if (def.base === "MULTITHING" && (await store_getMultiData(creationId)) == undefined) {
                log(`Creation "${def.name}" is a multi, fetching content`);
                const data = await retryOnThrow(() => api_getMultiData(def.id));
                if (Array.isArray(data?.itemProps)) {
                    for (const { id } of data.itemProps) {
                        await store_addToQueue(id);
                    }
                }
                await store_setMultiData(def.id, data);
                await sleep(SLEEP_CREATIONDL_API_SUBCONTENT);
                log(`Creation "${def.name}" is a multi, fetching content done`);
            }
            else if (def.base === "STACKWEARB" && (await store_getBodyMotions(creationId)) == undefined) {
                log(`Creation "${def.name}" is a body, fetching motion bar`);
                const data = await retryOnThrow(() => api_getBodyMotions(def.id));
                if (Array.isArray(data.ids)) {
                    for (const id of data.ids) {
                        await store_addToQueue(id);
                    }
                }
                await store_setBodyMotions(def.id, data);
                await sleep(SLEEP_CREATIONDL_API_SUBCONTENT);
                log(`Creation "${def.name}" is a body, fetching motion bar done`);
            }
            else if (def.base === "POINTER" && typeof def.prop?.url === "string" && def.prop.url.length === 10) {
                log(`Creation "${def.name}" is a pointer, fetching associated location`);
                await saveSnapByShortcode(def.prop.url);
                log(`Creation "${def.name}" is a pointer, fetching associated location done`);
            }
            // get from props
            if (def.prop?.emitsId)
                await store_addToQueue(def.prop.emitsId);
            if (def.prop?.motionId)
                await store_addToQueue(def.prop.motionId);
            if (def.prop?.environmentId)
                await store_addToQueue(def.prop.environmentId);
            if (def.prop?.getId)
                await store_addToQueue(def.prop.getId);
            if (def.prop?.hasId)
                await store_addToQueue(def.prop.hasId);
            if (def.prop?.holdableId)
                await store_addToQueue(def.prop.holdableId);
            if (def.prop?.wearableId)
                await store_addToQueue(def.prop.wearableId);
            if (def.prop?.thingRefs) {
                if (Array.isArray(def.prop.thingRefs)) {
                    for (const [id] of def.prop.thingRefs) {
                        await store_addToQueue(id);
                    }
                }
            }
            await store_addCreationDef(creationId, def);
            status_totalSavedCreations.update(v => v + 1);
            await sleep(SLEEP_CREATIONDL_CDN);
        }
        const def = (await store_getCreationDef(creationId));
        if ((def && couldFindOurId) ? def.creator === ourId : await creationIsInCreatedTab(creationId)) {
            /*
            // TODO (?)
            if ((await store_getCreationStats(creationId)) == undefined) {
                const stats = await retryOnThrow(() => api_getCreationStats(creationId));
                await store_setCreationStats(creationId, stats);

                await sleep(SLEEP_CREATIONDL_API_STATS)
            }
            */
            if ((await store_getCreationPainterData(creationId)) == undefined) {
                const data = await retryOnThrow(() => api_getCreationPainterData(creationId));
                await store_setCreationPainterData(creationId, data);
                await sleep(SLEEP_CREATIONDL_API_PAINTER_DATA);
            }
        }
    };
    const processCreationsInQueue = async () => {
        log("processing queue");
        while (true) {
            log("still processing queue...");
            const queue = await db.getAllKeys("creations-queue");
            status.textContent = `Downloading queued creations... (0 / ${queue.length})`;
            if (queue.length === 0)
                break;
            for (let i = 0; i < queue.length; i++) {
                const id = queue[i];
                // This ETA is a worst-case where all items are bodies/holders/motions, but it's probably better for it to complete faster than expected than shorter than expected
                // ETAs are a lie anyway
                status.textContent = `Downloading queued creations... (${i} / ${queue.length}) (ETA: ${Math.ceil((queue.length - i) * SLEEP_CREATIONDL_API_SUBCONTENT / 1000 / 60)} mins)`;
                if (await isCreationPublic(id)) {
                    status_totalPublicCollectionsFound.update(v => v + 1);
                    console.debug("skipping creation", id, "as it is available from universe search");
                }
                else {
                    await saveCreation(id);
                }
                db.delete("creations-queue", id);
                status_creationsInQueue.update(v => v - 1);
            }
        }
        log("processing queue done");
    };
    // #endregion creations
    // #region inventory
    const downloadAllCollectedCreations = async () => {
        const allIds = await db.getAllKeys("inventory-collections");
        for (let i = 0; i < allIds.length; i++) {
            status.textContent = `Downloading collected creations... (${i} / ${allIds.length})`;
            const id = allIds[i];
            if (await isCreationPublic(id)) {
                status_totalPublicCollectionsFound.update(v => v + 1);
                console.debug("skipping creation", id, "as it is available from universe search");
            }
            else {
                await saveCreation(id);
            }
        }
    };
    const downloadAllCreatedCreations = async () => {
        const allIds = await db.getAllKeys("inventory-creations");
        for (let i = 0; i < allIds.length; i++) {
            status.textContent = `Downloading created creations... (${i} / ${allIds.length})`;
            const id = allIds[i];
            await saveCreation(id);
        }
    };
    // #endregion inventory
    // SNAPSHOTS
    // #region snaps
    const schema_snap_loc = z.object({ p: z.coerce.number(), a: z.coerce.string(), x: z.coerce.number(), y: z.coerce.number() });
    const schema_snap = z.object({
        _id: z.string(),
        isPrivate: z.boolean().optional(),
        shortCode: z.string(),
        loc: schema_snap_loc,
    });
    const storeSnapData = async (snap) => await db.put('snapshots-data', snap, snap.shortCode);
    const getSnapData = async (shortCode) => await db.get('snapshots-data', shortCode);
    const getAllSnapShortCodes = async () => await db.getAllKeys('snapshots-data');
    const storeSnapImage = async (shortCode, blob) => await db.put('snapshots-image', blob, shortCode);
    const getSnapImage = async (shortCode) => await db.get('snapshots-image', shortCode);
    const downloadAndStoreSnap = async (shortCode) => {
        const inDb = await getSnapImage(shortCode);
        if (inDb) {
            log("snap already downloaded");
        }
        else {
            log("fetching snap", shortCode);
            const res = await fetch(`https://dskowcckk6st7.cloudfront.net/${shortCode}.png`);
            const blob = await res.blob();
            await storeSnapImage(shortCode, blob);
            await sleep(SLEEP_SNAP_DL);
        }
    };
    const downloadAllStoredSnaps = async () => {
        const allSnaps = await getAllSnapShortCodes();
        for (let i = 0; i < allSnaps.length; i++) {
            const shortCode = allSnaps[i];
            status.textContent = "Downloading snaps... (" + i + ")";
            try {
                await downloadAndStoreSnap(shortCode);
            }
            catch (e) {
                console.warn(`Error saving snap ${shortCode}! Skipping`);
            }
        }
    };
    const saveSnapByShortcode = async (shortCode) => {
        try {
            const rawData = await api_getSnapFromCode(shortCode);
            const data = schema_snap_loc.parse(rawData);
            await storeSnapData({
                _id: "5272e0f00000000000001919",
                shortCode,
                loc: data,
                isPrivate: true,
            });
        }
        catch (e) {
            console.warn(`Error saving snap ${shortCode}!`);
        }
    };
    // #endregion snaps
    const makeNameSafeForFile = (str) => str.replace(/[^a-z0-9. -]+/gi, '_');
    const makeDateSafeForFile = (str) => str.replace(/:/g, '.').slice(0, 19) + 'Z';
    const MAX_CREATION_NAME_LENGTH = 37;
    const MAX_MIFT_TEXT_LENGTH = 60;
    // #region zip
    const createZip = async () => {
        log("creating zip...");
        const zip = new JSZip();
        // #region zip_profile
        {
            status.textContent = "Creating zip... (adding account data)";
            zip.file(`profile_own-id.json`, JSON.stringify(ourId, null, 2));
            const profile = await store_getProfileData();
            zip.file(`profile.json`, JSON.stringify(profile, null, 2));
            const topCreations = await store_getProfileTopCreations();
            zip.file(`profile_top-creations.json`, JSON.stringify(topCreations, null, 2));
            zip.file(`profile_boost-assocs.json`, JSON.stringify({}, null, 2));
        }
        // #endregion zip_profile
        // #region zip_snaps
        const allSnaps = await getAllSnapShortCodes();
        const snapFilenames = {};
        const snapCsvDataset = [["shortCode", "date", "areaId", "areaPlane", "x", "y", "isPrivate", "_id"]];
        for (const shortCode of allSnaps) {
            log("adding snap", shortCode);
            status.textContent = `Creating zip... (adding snap ${shortCode})`;
            const data = await getSnapData(shortCode);
            const imageBlob = await getSnapImage(shortCode);
            const takenAtDate = dateFromObjectId(data._id).toISOString();
            const filename = `${makeDateSafeForFile(takenAtDate)}_${shortCode}_${data.loc?.a}_${data.isPrivate ? "private" : "public"}`;
            snapFilenames[shortCode] = filename;
            zip.file(`snapshots/${filename}.json`, JSON.stringify(data, null, 2));
            zip.file(`snapshots/${filename}.png`, imageBlob);
            snapCsvDataset.push([data.shortCode, takenAtDate, data.loc?.a, data.loc?.p, data.loc?.x, data.loc?.y, data.isPrivate ? "true" : "false", data._id]);
        }
        zip.file(`snapshots/filename_mapping.json`, JSON.stringify(snapFilenames, null, 2));
        status.textContent = `Creating zip... (adding snapshots.csv)`;
        zip.file(`snapshots.csv`, csv_stringify_sync.stringify(snapCsvDataset));
        // #endregion zip_snaps
        // #region zip_mifts
        log("adding public mifts");
        const csvDataset_mifts = [["date", "from", "text", "isPrivate", "fromId", "toId", "_id"]];
        const allPublicMifts = await store_getAllMifts(false);
        for (const mift of allPublicMifts) {
            status.textContent = `Creating zip... (adding mift ${mift._id})`;
            const filename = makeNameSafeForFile(`${makeDateSafeForFile(mift.ts)} - from ${mift.fromName} - ${mift.text.slice(0, 60)}`);
            zip.file(`mifts/public/${filename}.json`, JSON.stringify(mift, null, 2));
            zip.file(`mifts/public/${filename}.png`, store_getCreationImage(mift.itemId));
            csvDataset_mifts.push([mift.ts, mift.fromName, mift.text, "false", mift.fromId, mift.toId, mift._id]);
        }
        log("adding private mifts");
        const allPrivateMifts = await store_getAllMifts(true);
        for (const mift of allPrivateMifts) {
            status.textContent = `Creating zip... (adding mift ${mift._id})`;
            const filename = makeNameSafeForFile(`${makeDateSafeForFile(mift.ts)} - from ${mift.fromName} - ${mift.text.slice(0, 60)}`);
            zip.file(`mifts/private/${filename}.json`, JSON.stringify(mift, null, 2));
            zip.file(`mifts/private/${filename}.png`, store_getCreationImage(mift.itemId));
            csvDataset_mifts.push([mift.ts, mift.fromName, mift.text, "true", mift.fromId, mift.toId, mift._id]);
        }
        status.textContent = `Creating zip... (adding mifts.csv)`;
        zip.file(`mifts.csv`, csv_stringify_sync.stringify(csvDataset_mifts));
        // #endregion zip_mifts
        // #region zip_creations
        {
            const csvDataset = [["id", "createdAt", "type", "name", "timesPlaced", "timesCollected"]];
            const allKeys = await db.getAllKeys('creations-data-def');
            for (let i = 0; i < allKeys.length; i++) {
                const id = allKeys[i];
                status.textContent = `Creating zip... (adding creation ${i}/${allKeys.length})`;
                const def = await store_getCreationDef(id);
                const img = await store_getCreationImage(id);
                const date = dateFromObjectId(id).toISOString();
                const filename = `${makeDateSafeForFile(date)}_${id}_${def.base || ""}_${makeNameSafeForFile(def.name || "").slice(0, MAX_CREATION_NAME_LENGTH)}`;
                if (couldFindOurId ? def.creator === ourId : await creationIsInCreatedTab(id)) {
                    zip.file(`my-creations/${filename}.png`, img);
                    zip.file(`my-creations/${filename}.json`, JSON.stringify(def, null, 2));
                    const stats = await store_getCreationStats(id);
                    zip.file(`my-creations_stats/${id}.json`, JSON.stringify(stats));
                    const painterData = await store_getCreationPainterData(id);
                    zip.file(`my-creations_painterdata/${id}.json`, JSON.stringify(painterData));
                    csvDataset.push([id, date, def.base, def.name, stats?.timesPd, stats?.timesCd]);
                }
                else {
                    zip.file(`other-creations/${filename}.png`, img);
                    zip.file(`other-creations/${filename}.json`, JSON.stringify(def, null, 2));
                }
                if (def.base === "MULTITHING") {
                    const data = await store_getMultiData(id);
                    zip.file(`creations-data/multis/${id}.json`, JSON.stringify(data));
                }
                else if (def.base === "HOLDER") {
                    const data = await store_getHolderContent(id);
                    zip.file(`creations-data/holders/${id}.json`, JSON.stringify(data));
                }
                else if (def.base === "STACKWEARB") {
                    const data = await store_getBodyMotions(id);
                    zip.file(`creations-data/body-motions/${id}.json`, JSON.stringify(data));
                }
            }
            // This is for creations where we got the sprite but not the def
            status.textContent = `Creating zip... (adding sprites)`;
            const allImageKeys = await db.getAllKeys('creations-image');
            for (let i = 0; i < allImageKeys.length; i++) {
                const id = allImageKeys[i];
                // Skip if we have the def
                if ((await db.getKey("creations-data-def", id)) !== undefined) {
                    continue;
                }
                status.textContent = `Creating zip... (adding sprite ${i}/${allImageKeys.length})`;
                const img = await store_getCreationImage(id);
                const date = dateFromObjectId(id).toISOString();
                const filename = `${makeDateSafeForFile(date)}_${id}_${"UNKNOWN"}_${makeNameSafeForFile("UNKNOWN").slice(0, MAX_CREATION_NAME_LENGTH)}`;
                if (await creationIsInCreatedTab(id)) {
                    zip.file(`my-creations/${filename}.png`, img);
                }
                else {
                    zip.file(`other-creations/${filename}.png`, img);
                }
            }
            // NOTE: we only store CSV data for our own creations
            status.textContent = `Creating zip... (adding my-creations.csv)`;
            zip.file(`my-creations.csv`, csv_stringify_sync.stringify(csvDataset));
        }
        // #endregion zip_creations
        status.textContent = `Creating zip... (adding inventory data)`;
        zip.file(`inventory-collected.json`, JSON.stringify(await db.getAllKeys(`inventory-collections`), null, 2));
        zip.file(`inventory-created.json`, JSON.stringify(await db.getAllKeys(`inventory-creations`), null, 2));
        log("generating file...");
        status.textContent = `Creating zip... (generating file, this can take a while!)`;
        const zipBlob = await zip.generateAsync({ type: "blob" });
        log("downloading file...");
        saveAs(zipBlob, "manyland-account-archive.zip");
        log("done!");
    };
    // #endregion zip
    const runExporter = async () => {
        setAttr(btn_start, { disabled: true });
        try {
            log("starting! version:", version);
            status.textContent = "Downloading snaps...";
            await downloadAllStoredSnaps();
            const extraSnaps = [];
            for (const snap of extraSnaps) {
                await saveSnapByShortcode(snap);
            }
            status.textContent = "Downloading created creations...";
            await downloadAllCreatedCreations();
            status.textContent = "Downloading collected creations...";
            await downloadAllCollectedCreations();
            if (btn_queueEnabled.checked) {
                status.textContent = "Downloading queued creations...";
                await processCreationsInQueue();
            }
            status.textContent = "Creating zip...";
            await createZip();
            status.textContent = "Done!";
        }
        catch (e) {
            console.error("error:", e);
            // @ts-ignore
            if (!e._offlineland_handled) {
                status.textContent += "Unexpected error! Retry later or post on the offlineland board!";
            }
        }
        //db.close();
        setAttr(btn_start, { disabled: false });
    };
    btn_start.onclick = runExporter;
    document.addEventListener("error", (e) => {
        console.error("error:", e);
        if (!e.error && e.error._offlineland_handled) {
            status.textContent += "Unexpected error! Retry later or post on the offlineland board!";
        }
    });
    document.addEventListener("unhandledrejection", (e) => {
        console.error("unhandledrejection:", e);
        status.textContent += "Unexpected error! Retry later or post on the offlineland board!";
    });
})();
