import { StyleProfile, LibraryItem } from '../types';

const DB_NAME = 'pixelforge_db';
const DB_VERSION = 2;
const STORE_PROFILES = 'style_profiles';
const STORE_LIBRARY = 'library_items';

export const INITIAL_CHARACTERS_PROFILE: StyleProfile = {
  id: 'profile_characters',
  name: 'Characters',
  description:
    'tiny chibi figures in 24x24 pixel cell for standing poses (32x24 cell for swinging tools/weapons). Plain white/cream body, round head, two small dot eyes, dark brown 1-pixel outline, no clothes or hair unless asked. Hard square pixels, no anti-aliasing, no blur, no gradients, small palette.',
  frameWidth: 24,
  frameHeight: 24,
  outlineColor: '#3d251e',
  isBuiltIn: true,
  anchorId: 'ref_char_anchor_single',
  palette: [
    '#ffffff',
    '#faf3e8',
    '#f4ede2',
    '#e5ded3',
    '#d6ccc2',
    '#f28482',
    '#e07a5f',
    '#81b29a',
    '#3d251e',
    '#251612',
    '#000000',
  ],
  references: [
    {
      id: 'ref_char_anchor_single',
      label: 'Right-Facing Figure Anchor (8x on Magenta)',
      url: '/assets/anchor_figure_right_facing.png',
      isAnchor: true,
    },
    {
      id: 'ref_char_front_single',
      label: 'Front-Facing Figure (8x on Magenta)',
      url: '/assets/reference_character_front_192.png',
    },
    {
      id: 'ref_char_walk_row',
      label: 'Single Row Walk Reference (Magenta)',
      url: '/assets/reference_character_walk_row_magenta.png',
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

// Open IndexedDB instance
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_LIBRARY)) {
        db.createObjectStore(STORE_LIBRARY, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Style Profiles Storage
export async function getStoredProfiles(): Promise<StyleProfile[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROFILES, 'readonly');
      const store = tx.objectStore(STORE_PROFILES);
      const req = store.getAll();

      req.onsuccess = () => {
        let list: StyleProfile[] = req.result || [];
        if (!list || list.length === 0) {
          // Initialize with default profiles
          list = [INITIAL_CHARACTERS_PROFILE, INITIAL_BACKGROUNDS_PROFILE];
          saveAllProfiles(list);
        } else {
          // Ensure built-in Characters profile has the latest 24x24 single-figure anchor
          let migrated = false;
          list = list.map((p) => {
            if (
              p.id === 'profile_characters' &&
              (p.frameWidth === 16 || !p.references.some((r) => r.id === 'ref_char_anchor_single'))
            ) {
              migrated = true;
              return {
                ...p,
                frameWidth: 24,
                frameHeight: 24,
                description: INITIAL_CHARACTERS_PROFILE.description,
                anchorId: INITIAL_CHARACTERS_PROFILE.anchorId,
                references: INITIAL_CHARACTERS_PROFILE.references,
              };
            }
            return p;
          });
          if (migrated) {
            saveAllProfiles(list);
          }
        }
        resolve(list);
      };

      req.onerror = () => {
        resolve([INITIAL_CHARACTERS_PROFILE, INITIAL_BACKGROUNDS_PROFILE]);
      };
    });
  } catch (err) {
    console.warn('Falling back to localStorage for profiles:', err);
    const local = localStorage.getItem('pixelforge_profiles');
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
        // ignore
      }
    }
    return [INITIAL_CHARACTERS_PROFILE, INITIAL_BACKGROUNDS_PROFILE];
  }
}

export async function saveProfile(profile: StyleProfile): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PROFILES, 'readwrite');
    const store = tx.objectStore(STORE_PROFILES);
    store.put(profile);
  } catch (err) {
    console.warn('IndexedDB saveProfile failed, saving to localStorage:', err);
  }

  // Backup to localStorage
  const current = await getStoredProfiles();
  const index = current.findIndex((p) => p.id === profile.id);
  if (index >= 0) {
    current[index] = profile;
  } else {
    current.push(profile);
  }
  localStorage.setItem('pixelforge_profiles', JSON.stringify(current));
}

export async function saveAllProfiles(profiles: StyleProfile[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PROFILES, 'readwrite');
    const store = tx.objectStore(STORE_PROFILES);
    store.clear();
    for (const p of profiles) {
      store.put(p);
    }
  } catch (e) {
    // ignore
  }
  localStorage.setItem('pixelforge_profiles', JSON.stringify(profiles));
}

export async function deleteProfileFromDB(profileId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PROFILES, 'readwrite');
    const store = tx.objectStore(STORE_PROFILES);
    store.delete(profileId);
  } catch (e) {
    // ignore
  }

  const current = await getStoredProfiles();
  const filtered = current.filter((p) => p.id !== profileId);
  localStorage.setItem('pixelforge_profiles', JSON.stringify(filtered));
}

export const STARTER_LIBRARY_ITEMS: LibraryItem[] = [
  {
    id: 'item_seed_idle',
    name: 'fig_idle',
    type: 'animation',
    profileId: 'profile_characters',
    profileName: 'Characters',
    prompt: 'chibi character idle stance 4 frames',
    referencesUsed: ['Base Idle Character (Anchor)'],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    rawImage: '/assets/aistudio/16x16_Idle-Sheet_00a11b4c.png',
    cleanedImage: '/assets/aistudio/16x16_Idle-Sheet_00a11b4c.png',
    frames: [
      '/assets/aistudio/16x16_Idle-Sheet_00a11b4c.png',
      '/assets/aistudio/16x16_Idle-Sheet_00a11b4c.png',
      '/assets/aistudio/16x16_Idle-Sheet_00a11b4c.png',
      '/assets/aistudio/16x16_Idle-Sheet_00a11b4c.png',
    ],
    metadata: {
      frameWidth: 16,
      frameHeight: 24,
      frameCount: 4,
      fps: 8,
      baselineY: 22,
      facing: 'right',
    },
  },
  {
    id: 'item_seed_bg',
    name: 'bg_pine_hills',
    type: 'background',
    profileId: 'profile_backgrounds',
    profileName: 'Backgrounds',
    prompt: 'rolling pine hills with layered atmospheric perspective',
    referencesUsed: ['Rolling Pine Hills (Anchor)'],
    createdAt: new Date().toISOString(),
    rawImage: '/assets/aistudio/image_e2a4566b.png',
    cleanedImage: '/assets/aistudio/image_e2a4566b.png',
    frames: ['/assets/aistudio/image_e2a4566b.png'],
    metadata: {
      frameWidth: 320,
      frameHeight: 64,
      frameCount: 1,
      fps: 0,
      baselineY: 0,
      tiling: true,
    },
  },
];

// Library Items Storage
export async function getStoredLibrary(): Promise<LibraryItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_LIBRARY, 'readonly');
      const store = tx.objectStore(STORE_LIBRARY);
      const req = store.getAll();

      req.onsuccess = () => {
        let list: LibraryItem[] = req.result || [];
        if (!list || list.length === 0) {
          list = getFallbackLibrary();
        }
        if (!list || list.length === 0) {
          list = STARTER_LIBRARY_ITEMS;
          saveAllLibraryItems(list);
        }
        resolve(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      };

      req.onerror = () => {
        const fallback = getFallbackLibrary();
        resolve(fallback.length > 0 ? fallback : STARTER_LIBRARY_ITEMS);
      };
    });
  } catch (err) {
    const fallback = getFallbackLibrary();
    return fallback.length > 0 ? fallback : STARTER_LIBRARY_ITEMS;
  }
}

function getFallbackLibrary(): LibraryItem[] {
  const local = localStorage.getItem('pixelforge_library');
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      // ignore
    }
  }
  return [];
}

export async function saveAllLibraryItems(items: LibraryItem[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LIBRARY, 'readwrite');
    const store = tx.objectStore(STORE_LIBRARY);
    for (const item of items) {
      store.put(item);
    }
  } catch (err) {
    // ignore
  }
  localStorage.setItem('pixelforge_library', JSON.stringify(items));
}

export async function saveLibraryItem(item: LibraryItem): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LIBRARY, 'readwrite');
    const store = tx.objectStore(STORE_LIBRARY);
    store.put(item);
  } catch (err) {
    console.warn('IndexedDB saveLibraryItem failed:', err);
  }

  const current = getFallbackLibrary();
  const index = current.findIndex((i) => i.id === item.id);
  if (index >= 0) {
    current[index] = item;
  } else {
    current.unshift(item);
  }
  localStorage.setItem('pixelforge_library', JSON.stringify(current));
}

export async function deleteLibraryItem(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LIBRARY, 'readwrite');
    const store = tx.objectStore(STORE_LIBRARY);
    store.delete(id);
  } catch (err) {
    // ignore
  }

  const current = await getStoredLibrary();
  const filtered = current.filter((i) => i.id !== id);
  localStorage.setItem('pixelforge_library', JSON.stringify(filtered));
}
