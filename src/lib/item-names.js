// Item name constants - use these instead of hardcoding strings
export const ITEM_NAMES = {
  CHAI: "Special Chai",
  BUN: "Bun",
  TIRAMISU: "Tiramisu",
  // Legacy support for old data
  CHAI_LEGACY: "Irani Chai",
};

// Helper function to check if an item is chai (handles both new and legacy names)
export function isChai(itemName) {
  return itemName === ITEM_NAMES.CHAI || itemName === ITEM_NAMES.CHAI_LEGACY;
}

// Helper function to check if an item is bun
export function isBun(itemName) {
  return itemName === ITEM_NAMES.BUN;
}

// Helper function to check if an item is tiramisu
export function isTiramisu(itemName) {
  return itemName === ITEM_NAMES.TIRAMISU;
}

