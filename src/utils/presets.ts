import { PresetItem } from '../types';

export const ANIMATION_PRESETS: PresetItem[] = [
  { id: 'anim_idle', name: 'idle (4 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'subtle breathing and blinking idle stance', frameCount: 4, facing: 'right', frameWidth: 24, frameHeight: 24 },
  { id: 'anim_walk', name: 'walk (6 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'smooth continuous walking cycle, swinging arms and stepping legs', frameCount: 6, facing: 'right', frameWidth: 24, frameHeight: 24 },
  { id: 'anim_chop', name: 'chop with axe (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'raising a woodcutter axe overhead and swinging down forcefully', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_mine', name: 'mine with pickaxe (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'swinging an iron pickaxe into a rock face with impact anticipation', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_carry', name: 'carry a box (6 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'walking forward while holding a wooden crate with both hands', frameCount: 6, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_setdown', name: 'set down a box (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'bending knees, placing wooden crate gently on the ground, standing back up', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_push', name: 'push forward (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'leaning forward with hands outstretched against heavy resistance', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_gather', name: 'kneel and gather (4 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'kneeling down, reaching hands to forage herbs from the ground', frameCount: 4, facing: 'right', frameWidth: 24, frameHeight: 24 },
  { id: 'anim_hammer', name: 'hammer (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'raising hammer overhead and striking downward on an anvil', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_dig', name: 'dig with shovel (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'driving shovel into earth, stepping on blade, tossing dirt', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_hoe', name: 'hoe (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'tilling soil with garden hoe, striking ground and dragging back', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_sword', name: 'sword swing (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'quick horizontal sword slash across chest with follow-through', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_spear', name: 'spear thrust (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'drawing spear back into chamber and thrusting sharp tip straight forward', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_shield', name: 'shield brace (2 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'crouching into defensive posture behind a round wooden shield', frameCount: 2, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_read', name: 'sit and read (4 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'sitting cross-legged turning pages of an open spellbook', frameCount: 4, facing: 'right', frameWidth: 24, frameHeight: 24 },
  { id: 'anim_spyglass', name: 'spyglass scouting (4 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'holding brass spyglass up to eye, scanning the horizon', frameCount: 4, facing: 'right', frameWidth: 24, frameHeight: 24 },
  { id: 'anim_map', name: 'kneel over map (4 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'kneeling on one knee studying an unfolded parchment map', frameCount: 4, facing: 'right', frameWidth: 24, frameHeight: 24 },
  { id: 'anim_fish', name: 'fishing (4 frames, 32x24)', type: 'animation', profileType: 'characters', description: 'holding fishing rod by water, bobber dipping, pulling gently', frameCount: 4, facing: 'right', frameWidth: 32, frameHeight: 24 },
  { id: 'anim_cheer', name: 'cheer (4 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'jumping in place with both hands raised celebrating victory', frameCount: 4, facing: 'front', frameWidth: 24, frameHeight: 24 },
  { id: 'anim_exhausted', name: 'sit exhausted (4 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'sitting slumped on ground, panting wearily, wiping brow', frameCount: 4, facing: 'right', frameWidth: 24, frameHeight: 24 },
  { id: 'anim_flinch', name: 'flinch (2 frames, 24x24)', type: 'animation', profileType: 'characters', description: 'recoiling backwards from incoming damage, arms shielding face', frameCount: 2, facing: 'right', frameWidth: 24, frameHeight: 24 },
];

export const BACKGROUND_PRESETS: PresetItem[] = [
  { id: 'bg_forest', name: 'forest', type: 'background', profileType: 'backgrounds', description: 'lush deciduous woodland with soft canopy silhouettes, gentle sunlit ground, rolling mossy hills', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_pine_forest', name: 'pine forest', type: 'background', profileType: 'backgrounds', description: 'dense alpine evergreen pines, misty blue distant peaks, cool morning atmosphere', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_plains', name: 'plains', type: 'background', profileType: 'backgrounds', description: 'broad rolling green meadows under a vast stepped sky, distant low hills and ancient standing stones', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_farmland', name: 'farmland', type: 'background', profileType: 'backgrounds', description: 'golden wheat fields, rustic wooden fences, distant thatched barn silhouette on rolling terrace', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_mine_tunnel', name: 'mine tunnel', type: 'background', profileType: 'backgrounds', description: 'underground quarry tunnel with rough stone strata, timber support beams, faint amber lantern glows', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: false },
  { id: 'bg_cave', name: 'cave', type: 'background', profileType: 'backgrounds', description: 'deep subterranean cavern, stalactites hanging from ceiling, glowing turquoise crystal veins in rock walls', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: false },
  { id: 'bg_ruins', name: 'ruins', type: 'background', profileType: 'backgrounds', description: 'crumbling stone columns, overgrown vine-covered arches, fallen stone monoliths under twilight sky', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_training_yard', name: 'training yard', type: 'background', profileType: 'backgrounds', description: 'outdoor barracks training ground with wooden palisade wall, archery targets, weapon racks in distance', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_village', name: 'village', type: 'background', profileType: 'backgrounds', description: 'quaint medieval hamlet rooftops, cobblestone lane, distant windmills on gentle hill horizon', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_lakeshore', name: 'lakeshore', type: 'background', profileType: 'backgrounds', description: 'calm glassy lake reflection, reeds along shore, soft mist rising between distant mountain ridges', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_mountain_path', name: 'mountain path', type: 'background', profileType: 'backgrounds', description: 'high altitude rocky ledge, sheer cliffs, sweeping panoramic haze over low valleys below', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_snow', name: 'snow', type: 'background', profileType: 'backgrounds', description: 'pristine snowdrift dunes, frosted frozen pines, pale icy lavender skies and frosted glaciers', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_desert', name: 'desert', type: 'background', profileType: 'backgrounds', description: 'sweeping windblown sand dunes, distant arid sandstone mesas, ancient stone pyramid silhouettes', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
  { id: 'bg_swamp', name: 'swamp', type: 'background', profileType: 'backgrounds', description: 'murky bayou with gnarled cypress trees, hanging Spanish moss, still dark water with lily pads', frameWidth: 320, frameHeight: 64, tilingSeamless: true, splitParallax: true },
];

export const PROP_PRESETS: PresetItem[] = [
  {
    id: 'prop_forest',
    name: 'forest props',
    type: 'prop',
    profileType: 'characters',
    description: 'collection of woodland props and interactive items',
    propItems: 'Woodcutter axe\nChopped log stack\nTree stump with wedged wedge\nWild red mushroom cluster\nFallen hollow branch\nAcorns and pinecone bundle\nWicker foraging basket\nBird nest with egg',
  },
  {
    id: 'prop_mine',
    name: 'mine props',
    type: 'prop',
    profileType: 'characters',
    description: 'underground excavation tools and minerals',
    propItems: 'Iron pickaxe\nWooden ore cart\nGold ore chunk\nIron ore chunk\nKerosene lantern\nWooden crate with dynamite\nSledgehammer\nMine support timber arch',
  },
  {
    id: 'prop_farm',
    name: 'farm props',
    type: 'prop',
    profileType: 'characters',
    description: 'agricultural tools and harvested produce',
    propItems: 'Pitchfork\nGarden hoe\nWatering can\nWooden bucket of milk\nWoven bushel of carrots\nCorn bushel\nHay bale\nWooden wheelbarrow',
  },
  {
    id: 'prop_training',
    name: 'training props',
    type: 'prop',
    profileType: 'characters',
    description: 'combat practice equipment and martial supplies',
    propItems: 'Straw training dummy\nRound wooden buckler shield\nWooden practice sword\nArchery bullseye target on stand\nQuiver with arrows\nIron shortsword in scabbard\nWeapon rack\nIron kettlebell weight',
  },
  {
    id: 'prop_camp',
    name: 'camp props',
    type: 'prop',
    profileType: 'characters',
    description: 'survival campsite essentials and wilderness equipment',
    propItems: 'Campfire with stones and glowing embers\nCanvas bedroll sleeping bag\nIron cooking pot on tripod\nLeather waterskin canteen\nCloth tent with wooden pegs\nWooden stool\nUnrolled parchment map with compass\nBackpack with bedroll tied on top',
  },
  {
    id: 'prop_building',
    name: 'building props',
    type: 'prop',
    profileType: 'characters',
    description: 'carpentry, construction and architectural materials',
    propItems: 'Claw hammer\nHand saw\nWooden plank pile\nBucket of iron nails\nToolbox with brass latch\nBrick stack with mortar trowel\nWooden ladder\nDraftsman drafting table',
  },
];

/**
 * Library name for an asset generated from a preset:
 * anim_idle -> fig_idle, bg_forest -> bg_forest, prop_forest -> props_forest.
 */
export function getPresetAssetName(preset: PresetItem): string {
  if (preset.id.startsWith('anim_')) return `fig_${preset.id.slice('anim_'.length)}`;
  if (preset.id.startsWith('prop_')) return `props_${preset.id.slice('prop_'.length)}`;
  return preset.id;
}
