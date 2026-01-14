/**
 * Keyboard mapping utilities for non-Latin keyboard layouts.
 * Maps physical key positions to Latin characters for hint selection.
 */

/**
 * Cyrillic to Latin keyboard mapping (based on standard Russian keyboard layout)
 * Maps physical key positions: Cyrillic letter → Latin letter on same key
 */
export const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
    'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't', 'н': 'y', 'г': 'u', 'ш': 'i', 'щ': 'o', 'з': 'p',
    'ф': 'a', 'ы': 's', 'в': 'd', 'а': 'f', 'п': 'g', 'р': 'h', 'о': 'j', 'л': 'k', 'д': 'l',
    'я': 'z', 'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n', 'ь': 'm',
    'Й': 'Q', 'Ц': 'W', 'У': 'E', 'К': 'R', 'Е': 'T', 'Н': 'Y', 'Г': 'U', 'Ш': 'I', 'Щ': 'O', 'З': 'P',
    'Ф': 'A', 'Ы': 'S', 'В': 'D', 'А': 'F', 'П': 'G', 'Р': 'H', 'О': 'J', 'Л': 'K', 'Д': 'L',
    'Я': 'Z', 'Ч': 'X', 'С': 'C', 'М': 'V', 'И': 'B', 'Т': 'N', 'Ь': 'M',
    // Additional characters on Russian keyboard
    'х': '[', 'ъ': ']', 'ж': ';', 'э': "'", 'б': ',', 'ю': '.',
    'Х': '{', 'Ъ': '}', 'Ж': ':', 'Э': '"', 'Б': '<', 'Ю': '>',
};

/**
 * Modifier keys that should be ignored during hint selection
 */
export const MODIFIER_KEYS: ReadonlySet<string> = new Set([
    'Shift', 'Meta', 'Escape', 'Control', 'Alt',
    'CapsLock', 'Tab', 'Backspace', 'Enter'
]);

/**
 * Detects if a string contains Cyrillic characters
 */
export function isCyrillic(str: string): boolean {
    return /[\u0400-\u04FF]/.test(str);
}

/**
 * Converts Cyrillic letters to Latin based on keyboard layout position.
 * Used to map Cyrillic keypresses to Latin labels.
 */
export function convertToLatin(str: string): string {
    return str.split('').map(char => CYRILLIC_TO_LATIN[char] || char).join('');
}

/**
 * Normalizes a keypress to its Latin equivalent.
 * Handles Cyrillic input by mapping to physical key position.
 */
export function normalizeKeypress(key: string): string {
    if (isCyrillic(key)) {
        return convertToLatin(key);
    }
    return key;
}

/**
 * Checks if a key is a modifier key that should be ignored
 */
export function isModifierKey(key: string): boolean {
    return MODIFIER_KEYS.has(key);
}
