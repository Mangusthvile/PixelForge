import { StyleProfile, LibraryItem } from '../types';

// Library items and style profiles live in IndexedDB only.
// localStorage is reserved for small settings (e.g. the selected model id).

const DB_NAME = 'pixelforge_db';
const DB_VERSION = 2;
const STORE_PROFILES = 'style_profiles';
const STORE_LIBRARY = 'library_items';

export const INITIAL_CHARACTERS_PROFILE: StyleProfile = {
  id: 'profile_characters',
  name: 'Characters',
  description:
    'tiny chibi figures in 24x24 pixel cell for standing poses (32x24 cell for swinging tools/weapons). Plain white/cream body, round head, dark brown 1-pixel outline, no clothes or hair unless asked. Side view facing right unless asked otherwise. No blush, no cheek color, no mouth. Face is only two small dot eyes. Hard square pixels, no anti-aliasing, no blur, no gradients, small palette.',
  frameWidth: 24,
  frameHeight: 24,
  outlineColor: '#2f2522',
  isBuiltIn: true,
  anchorId: 'ref_char_anchor_noblush',
  palette: ['#faf3e8', '#2f2522', '#b9b3a1', '#e7d5c6'],
  paletteRoles: {
    '#faf3e8': 'body',
    '#e7d5c6': 'body',
    '#b9b3a1': 'body',
    '#2f2522': 'outline',
  },
  autoCleanAfterGeneration: true,
  references: [
    {
      id: 'ref_char_anchor_noblush',
      label: 'Right-Facing Anchor (8x on Magenta, no blush)',
      url: '/assets/anchor_right_x8_magenta_noblush.png',
      isAnchor: true,
    },
    {
      id: 'ref_char_walk_row_noblush',
      label: 'Walk Row Style Reference (8x on Magenta, no blush)',
      url: '/assets/walk_row_x8_magenta_noblush.png',
    },
  ],
};

export const INITIAL_BACKGROUNDS_PROFILE: StyleProfile = {
  id: 'profile_backgrounds',
  name: 'Backgrounds',
  description:
    'soft layered side-view landscapes. Sky is a smooth vertical band of flat color steps, not a real gradient. Distant mountains are pale and hazy, close to the sky color. Each layer closer to the viewer is darker and more saturated (atmospheric perspective). Simple rounded shapes, pine trees as clean silhouettes, low detail, calm mood. Pixel art with flat color bands.',
  frameWidth: 320,
  frameHeight: 64,
  outlineColor: '#202a36',
  isBuiltIn: true,
  anchorId: 'ref_bg_pine_hills',
  palette: [
    '#4361ee',
    '#5887ff',
    '#80bfff',
    '#a7c8ff',
    '#cfe0fc',
    '#d4e09b',
    '#99c1b9',
    '#68a691',
    '#4f772d',
    '#31572c',
    '#132a13',
    '#202a36',
  ],
  references: [
    {
      id: 'ref_bg_pine_hills',
      label: 'Rolling Pine Hills (Anchor)',
      url: '/assets/aistudio/image_e2a4566b.png',
      isAnchor: true,
    },
    {
      id: 'ref_bg_pine_wall',
      label: 'Pine Tree Silhouettes',
      url: '/assets/aistudio/image_60896c23.png',
    },
    {
      id: 'ref_bg_desert_dunes',
      label: 'Desert Dunes & Steppes',
      url: '/assets/aistudio/image_0b502755.png',
    },
    {
      id: 'ref_bg_plains_ruins',
      label: 'Plains Monoliths & Sky Steps',
      url: '/assets/aistudio/image_8053f236.png',
    },
  ],
};

export const DEFAULT_PROFILES: StyleProfile[] = [INITIAL_CHARACTERS_PROFILE, INITIAL_BACKGROUNDS_PROFILE];

export function getDefaultProfile(id: string): StyleProfile | undefined {
  return DEFAULT_PROFILES.find((p) => p.id === id);
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_LIBRARY)) {
        db.createObjectStore(STORE_LIBRARY, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB open was blocked by another tab.'));
  });
  // Allow a retry on the next call if opening failed.
  opening.catch(() => {
    dbPromise = null;
  });
  dbPromise = opening;
  return opening;
}

/** Run a write transaction and resolve only once it has actually committed. */
async function writeTx(storeName: string, work: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, 'readwrite');
      work(tx.objectStore(storeName));
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`IndexedDB write to ${storeName} failed.`));
    tx.onabort = () => reject(tx.error || new Error(`IndexedDB write to ${storeName} was aborted.`));
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error || new Error(`IndexedDB read from ${storeName} failed.`));
  });
}

// ---------------------------------------------------------------------------
// One-time startup maintenance
// ---------------------------------------------------------------------------

const SEED_ITEM_IDS = ['item_seed_idle', 'item_seed_bg'];
const MAINTENANCE_FLAG = 'pixelforge_storage_cleanup_v1';
const LEGACY_LIBRARY_KEY = 'pixelforge_library';
const LEGACY_PROFILES_KEY = 'pixelforge_profiles';

function parseLegacyArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Runs once per browser:
 *  - deletes the old fake starter items (item_seed_idle, item_seed_bg)
 *  - moves items/profiles that only existed in the old localStorage fallback into IndexedDB
 *  - removes the old localStorage copies (they held full image data URLs and hit the quota)
 */
export async function runStartupMaintenance(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(MAINTENANCE_FLAG)) return;

  const legacyItems = parseLegacyArray<LibraryItem>(LEGACY_LIBRARY_KEY).filter(
    (i) => i && i.id && !SEED_ITEM_IDS.includes(i.id)
  );
  const legacyProfiles = parseLegacyArray<StyleProfile>(LEGACY_PROFILES_KEY).filter((p) => p && p.id);

  const existingItemIds = new Set((await readAll<LibraryItem>(STORE_LIBRARY)).map((i) => i.id));
  const existingProfileIds = new Set((await readAll<StyleProfile>(STORE_PROFILES)).map((p) => p.id));

  await writeTx(STORE_LIBRARY, (store) => {
    for (const id of SEED_ITEM_IDS) store.delete(id);
    for (const item of legacyItems) {
      if (!existingItemIds.has(item.id)) store.put(item);
    }
  });

  const profilesToImport = legacyProfiles.filter((p) => !existingProfileIds.has(p.id));
  if (profilesToImport.length > 0) {
    await writeTx(STORE_PROFILES, (store) => {
      for (const p of profilesToImport) store.put(p);
    });
  }

  localStorage.removeItem(LEGACY_LIBRARY_KEY);
  localStorage.removeItem(LEGACY_PROFILES_KEY);
  localStorage.setItem(MAINTENANCE_FLAG, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Style profiles
// ---------------------------------------------------------------------------

/**
 * Loads saved profiles. Built-in defaults are only added when missing,
 * so a saved Characters profile is never overwritten.
 */
export async function getStoredProfiles(): Promise<StyleProfile[]> {
  const stored = await readAll<StyleProfile>(STORE_PROFILES);
  const list = [...stored];
  const missing: StyleProfile[] = [];

  if (!list.some((p) => p.id === INITIAL_CHARACTERS_PROFILE.id)) {
    missing.push(INITIAL_CHARACTERS_PROFILE);
  }
  if (stored.length === 0) {
    missing.push(INITIAL_BACKGROUNDS_PROFILE);
  }

  if (missing.length > 0) {
    await writeTx(STORE_PROFILES, (store) => {
      for (const p of missing) store.put(p);
    });
    list.push(...missing);
  }

  // Built-ins first in their default order, then custom profiles.
  const order = (p: StyleProfile) => {
    const idx = DEFAULT_PROFILES.findIndex((d) => d.id === p.id);
    return idx === -1 ? DEFAULT_PROFILES.length : idx;
  };
  return list.sort((a, b) => order(a) - order(b));
}

export async function saveProfile(profile: StyleProfile): Promise<void> {
  await writeTx(STORE_PROFILES, (store) => {
    store.put(profile);
  });
}

export async function saveAllProfiles(profiles: StyleProfile[]): Promise<void> {
  await writeTx(STORE_PROFILES, (store) => {
    store.clear();
    for (const p of profiles) store.put(p);
  });
}

export async function deleteProfileFromDB(profileId: string): Promise<void> {
  await writeTx(STORE_PROFILES, (store) => {
    store.delete(profileId);
  });
}

// ---------------------------------------------------------------------------
// Library items
// ---------------------------------------------------------------------------

export async function getStoredLibrary(): Promise<LibraryItem[]> {
  const list = await readAll<LibraryItem>(STORE_LIBRARY);
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function saveLibraryItem(item: LibraryItem): Promise<void> {
  await writeTx(STORE_LIBRARY, (store) => {
    store.put(item);
  });
}

export async function deleteLibraryItem(id: string): Promise<void> {
  await writeTx(STORE_LIBRARY, (store) => {
    store.delete(id);
  });
}
