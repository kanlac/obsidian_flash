import {Editor} from "codemirror";
import {EditorView} from "@codemirror/view";
import {SourceLinkHint} from "../../types";
import {generateHintLabels} from "../hints/HintGenerator";
import {detectMarkdownLinks} from "../detection/LinkDetector";

// Re-export for backward compatibility
export {generateHintLabels as getLinkHintLetters};
export {detectMarkdownLinks as getMDHintLinks};

/**
 * Cyrillic to Latin keyboard mapping (based on standard Russian keyboard layout)
 * Maps physical key positions: Cyrillic letter → Latin letter on same key
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
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
 * Get only visible content (Legacy CM5)
 * @param cmEditor
 * @returns Letter offset and visible content as a string
 */
export function getVisibleLineText(cmEditor: Editor): { indOffset: number, strs: string } {
    const scrollInfo = cmEditor.getScrollInfo();
    const { line: from } = cmEditor.coordsChar({ left: 0, top: 0 }, 'page');
    const { line: to } = cmEditor.coordsChar({ left: scrollInfo.left, top: scrollInfo.top + scrollInfo.height})
    const indOffset = cmEditor.indexFromPos({ch:0, line: from})
    const strs = cmEditor.getRange({ch: 0, line: from}, {ch: 0, line: to + 1})

    return { indOffset, strs };
}

/**
 * Get visible lines content for CM6 editor
 * @param cmEditor - CM6 EditorView instance
 * @returns Object with index (start offset) and content (visible text)
 */
export function getVisibleLinesCM6(cmEditor: EditorView): { index: number, content: string } {
    let { from, to } = cmEditor.viewport;

    // @ts-ignore - accessing internal viewState for pixel-precise viewport
    if (cmEditor.viewState?.pixelViewport) {
        // @ts-ignore
        const pixelViewport = cmEditor.viewState.pixelViewport;
        // @ts-ignore
        const lines = cmEditor.viewState.viewportLines;

        if (lines?.length) {
            const pixelTop = pixelViewport.top;
            const pixelBottom = pixelViewport.bottom;

            // Adjust 'from' - first line whose bottom edge is below pixel top
            // @ts-ignore
            const firstVisibleLine = lines.find((line: any) => line.top + line.height > pixelTop);
            if (firstVisibleLine) {
                from = firstVisibleLine.from;
            }

            // Adjust 'to' - last line whose top edge is above pixel bottom
            // @ts-ignore
            const lastVisibleLine = [...lines].reverse().find((line: any) => line.top < pixelBottom);
            if (lastVisibleLine) {
                to = lastVisibleLine.to;
            }
        }
    }

    const content = cmEditor.state.sliceDoc(from, to);
    return { index: from, content };
}



export function createWidgetElement(content: string, type: string) {
    const linkHintEl = activeDocument.createElement('div');
    linkHintEl.classList.add('jl');
    linkHintEl.classList.add('jl-'+type);
    linkHintEl.classList.add('popover');
    linkHintEl.textContent = content;
    return linkHintEl;
}

export function displaySourcePopovers(cmEditor: Editor, linkKeyMap: SourceLinkHint[]): void {
    const drawWidget = (cmEditor: Editor, linkHint: SourceLinkHint) => {
        const pos = cmEditor.posFromIndex(linkHint.index);
        // the fourth parameter is undocumented. it specifies where the widget should be place
        return (cmEditor as any).addWidget(pos, createWidgetElement(linkHint.letter, linkHint.type), false, 'over');
    }

    linkKeyMap.forEach(x => drawWidget(cmEditor, x));
}
