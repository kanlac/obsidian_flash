/**
 * Match detector for Flash mode.
 * Finds text matches and assigns hint labels.
 */

import { EditorView } from "@codemirror/view";
import { Settings, FlashMatch } from "../../types";
import { escapeRegex } from "../utils/regexp";
import { getVisibleLinesCM6 } from "../utils/common";
import { generateHintLabels } from "../hints/HintGenerator";
import { findPyjjMatchesInContent, RawFlashMatch } from "./pyjj";

/**
 * Detects matches in visible content for Flash mode.
 */
export class FlashMatchDetector {
    private pyjjCodeCache = new Map<string, string[]>();

    constructor(
        private editor: EditorView,
        private settings: Settings
    ) {}

    /**
     * Find all matches for the search string in visible content.
     * Returns matches with assigned hint labels.
     */
    findMatches(searchString: string): FlashMatch[] {
        // Handle empty search string
        if (!searchString) {
            return [];
        }

        // Get visible content from editor
        const { index, content } = getVisibleLinesCM6(this.editor);

        // Handle empty content
        if (!content) {
            return [];
        }

        const matches = this.getRawMatches(searchString, content, index);
        if (matches.length === 0) {
            return [];
        }

        // Filter to only truly visible ranges (viewport includes off-screen buffer)
        // CM6's viewport is larger than the visible screen for smooth scrolling,
        // so we must filter to visibleRanges to avoid assigning labels to off-screen matches
        const visibleRanges = this.editor.visibleRanges;
        const visibleMatches = matches.filter(match => {
            return visibleRanges.some(range =>
                match.index >= range.from && match.index < range.to
            );
        });
        if (visibleMatches.length === 0) {
            return [];
        }

        // Exclude label keys that can continue the current search.
        // This is more robust than filtering only by text next-char.
        const continuationConflicts = this.collectSearchConflictChars(searchString, content, index);
        const labels = generateHintLabels(this.settings.letters, visibleMatches.length, continuationConflicts);

        // Assign labels to visible matches (matches are already in order by index)
        for (let i = 0; i < visibleMatches.length && i < labels.length; i++) {
            visibleMatches[i].letter = labels[i];
        }

        // Return only visible matches that have labels assigned
        return visibleMatches.filter(m => m.letter);
    }

    private collectSearchConflictChars(searchString: string, content: string, index: number): Set<string> {
        const conflicts = new Set<string>();
        const candidates = Array.from(new Set(this.settings.letters.toLowerCase().split('')))
            .filter(char => /\S/.test(char));

        for (const candidate of candidates) {
            const extendedMatches = this.getRawMatches(`${searchString}${candidate}`, content, index);
            if (extendedMatches.length > 0) {
                conflicts.add(candidate);
                if (conflicts.size === candidates.length) {
                    break;
                }
            }
        }

        return conflicts;
    }

    private getRawMatches(searchString: string, content: string, index: number): FlashMatch[] {
        const literalMatches = this.findLiteralMatches(searchString, content, index);
        if (this.settings.flashInputMode !== 'zh-pyjj') {
            return literalMatches.map(match => ({
                ...match,
                letter: '',
                type: 'flash'
            }));
        }

        const pyjjMatches = findPyjjMatchesInContent(searchString, content, index, this.pyjjCodeCache);
        const merged = this.mergeMatches(literalMatches, pyjjMatches);
        return merged.map(match => ({
            ...match,
            letter: '',
            type: 'flash'
        }));
    }

    private findLiteralMatches(searchString: string, content: string, index: number): RawFlashMatch[] {
        const escapedSearch = escapeRegex(searchString);
        const pattern = escapedSearch;

        let regex: RegExp;
        try {
            regex = this.settings.flashCaseSensitive
                ? new RegExp(pattern, 'gu')
                : new RegExp(pattern, 'igu');
        } catch (e) {
            console.warn('Unicode regex failed, using fallback:', e);
            regex = this.settings.flashCaseSensitive
                ? new RegExp(escapedSearch, 'g')
                : new RegExp(escapedSearch, 'ig');
        }

        const matches: RawFlashMatch[] = [];
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            matches.push({
                index: match.index + index,
                matchLength: match[0].length,
                linkText: match[0]
            });

            if (match.index === regex.lastIndex) {
                regex.lastIndex++;
            }
        }
        return matches;
    }

    private mergeMatches(...lists: RawFlashMatch[][]): RawFlashMatch[] {
        const merged = new Map<string, RawFlashMatch>();
        for (const list of lists) {
            for (const match of list) {
                const key = `${match.index}:${match.matchLength}`;
                if (!merged.has(key)) {
                    merged.set(key, match);
                }
            }
        }

        return Array.from(merged.values()).sort((left, right) => {
            if (left.index !== right.index) {
                return left.index - right.index;
            }
            return left.matchLength - right.matchLength;
        });
    }
}
