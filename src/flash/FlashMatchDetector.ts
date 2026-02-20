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
        const nextChars = new Set<string>();

        // Collect the character immediately after each match (flash.nvim style)
        for (const match of matches) {
            // Collect the character immediately after the match (flash.nvim style)
            // This prevents labels from conflicting with search extension
            const nextCharIndex = (match.index - index) + match.linkText.length;
            if (nextCharIndex < content.length) {
                const nextChar = content[nextCharIndex].toLowerCase();
                // Only exclude printable characters (not whitespace or newlines)
                if (nextChar && /\S/.test(nextChar)) {
                    nextChars.add(nextChar);
                }
            }
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
        // Generate labels, excluding characters that appear after matches
        // This ensures pressing a "next char" always extends the search rather than jumping
        const labels = generateHintLabels(this.settings.letters, visibleMatches.length, nextChars);

        // Assign labels to visible matches (matches are already in order by index)
        for (let i = 0; i < visibleMatches.length && i < labels.length; i++) {
            visibleMatches[i].letter = labels[i];
        }

        // Return only visible matches that have labels assigned
        return visibleMatches.filter(m => m.letter);
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
