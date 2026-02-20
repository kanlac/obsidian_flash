/**
 * Main controller for flash.nvim-style Flash mode.
 * Manages search state, keyboard handling, and match updates.
 */

import { EditorView } from "@codemirror/view";
import { Settings, FlashMatch } from "../../types";
import { FlashMatchDetector } from "./FlashMatchDetector";
import { FlashSearchPanel } from "./FlashSearchPanel";
import { normalizeKeypress, isModifierKey } from "../keyboard/KeyboardMapper";

/**
 * Callback for when the decoration (matches and labels) need to be updated.
 */
export type DecorationUpdateCallback = (matches: FlashMatch[], searchLength: number, matchedPrefix: string) => void;

/**
 * Callback for when a jump should be performed.
 */
export type JumpCallback = (index: number) => void;

/**
 * Callback for when Flash mode completes (jump or cancel).
 */
export type CompleteCallback = () => void;

/**
 * Controls the Flash mode lifecycle and interaction.
 */
export class FlashController {
    private searchString: string = '';
    private isActive: boolean = false;
    private isDeactivating: boolean = false;
    private matches: FlashMatch[] = [];
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private clickHandler: ((e: MouseEvent) => void) | null = null;
    private detector: FlashMatchDetector;
    private matchedPrefix: string = '';
    private prefixShiftHeld: boolean = false; // Track shift state for prefix key (two-letter labels)
    private lastShiftKey: boolean = false; // Track shift state of last key press for auto-jump
    private searchPanel: FlashSearchPanel | null = null;
    private onDecorationUpdate: DecorationUpdateCallback | null = null;
    private onJump: JumpCallback | null = null;
    private onComplete: CompleteCallback | null = null;

    constructor(
        private plugin: any,
        private view: any,
        private editor: EditorView,
        private settings: Settings,
        onJump?: JumpCallback,
        onDecorationUpdate?: DecorationUpdateCallback,
        onComplete?: CompleteCallback
    ) {
        this.detector = new FlashMatchDetector(editor, settings);
        this.onJump = onJump || null;
        this.onDecorationUpdate = onDecorationUpdate || null;
        this.onComplete = onComplete || null;
    }

    /**
     * Activate Flash mode.
     */
    activate(): void {
        this.isActive = true;
        this.searchString = '';
        this.matches = [];
        this.matchedPrefix = '';
        this.prefixShiftHeld = false;
        this.lastShiftKey = false;
        this.applyDimming();
        this.createSearchPanel();
        this.registerKeyHandler();
        this.registerClickHandler();
    }

    /**
     * Create and display the search panel.
     */
    private createSearchPanel(): void {
        if (this.view?.contentEl) {
            this.searchPanel = new FlashSearchPanel();
            this.searchPanel.create(this.view.contentEl);
        }
    }

    /**
     * Destroy the search panel.
     */
    private destroySearchPanel(): void {
        if (this.searchPanel) {
            this.searchPanel.destroy();
            this.searchPanel = null;
        }
    }

    /**
     * Deactivate Flash mode and clean up.
     * Has re-entry guard to prevent circular calls from onComplete -> removePopovers -> deactivate.
     */
    deactivate(): void {
        if (this.isDeactivating || !this.isActive) {
            return;  // Already deactivating or not active
        }
        this.isDeactivating = true;

        this.isActive = false;
        this.searchString = '';
        this.matches = [];
        this.matchedPrefix = '';
        this.prefixShiftHeld = false;
        this.lastShiftKey = false;
        this.notifyDecorationUpdate(); // Clear decorations
        this.removeDimming();
        this.destroySearchPanel();
        this.unregisterKeyHandler();
        this.unregisterClickHandler();

        // Notify completion callback (resets isLinkHintActive in main.ts)
        this.onComplete?.();

        this.isDeactivating = false;
    }

    /**
     * Get current search string.
     */
    getSearchString(): string {
        return this.searchString;
    }

    /**
     * Check if Flash mode is active.
     */
    isActivated(): boolean {
        return this.isActive;
    }

    /**
     * Get current matches.
     */
    getMatches(): FlashMatch[] {
        return this.matches;
    }

    /**
     * Handle a key event (exposed for testing).
     */
    handleKeyForTest(key: string, shiftKey: boolean = false): void {
        this.handleKeyDown(key, shiftKey);
    }

    /**
     * Process a key press with shift state tracking.
     */
    private handleKeyDown(key: string, shiftKey: boolean): void {
        // Store shift state for potential auto-jump in updateMatches
        this.lastShiftKey = shiftKey;

        // Handle escape - deactivate (before modifier check since Escape is in modifier list)
        if (key === 'Escape') {
            this.deactivate();
            return;
        }

        // Handle backspace - remove last character (before modifier check)
        if (key === 'Backspace') {
            if (this.matchedPrefix) {
                // Clear prefix filter if we're in label selection mode
                this.matchedPrefix = '';
                this.prefixShiftHeld = false;
                this.updateMatches();
            } else if (this.searchString.length > 0) {
                this.searchString = this.searchString.slice(0, -1);
                this.updateMatches();
            }
            return;
        }

        // Handle Tab - may cancel (treat as deactivate)
        if (key === 'Tab') {
            this.deactivate();
            return;
        }

        // Ignore modifier keys (Shift, Control, Alt, Meta, etc.)
        if (isModifierKey(key)) {
            return;
        }

        // Add to search string for printable characters
        if (this.isPrintable(key)) {
            // Normalize key for Cyrillic keyboard support
            const normalizedKey = normalizeKeypress(key);

            // Check if we're past minimum characters and have matches (label selection mode)
            if (this.searchString.length >= this.settings.flashCharacterCount && this.matches.length > 0) {
                // Check if we have a prefix filter active (user already typed first letter of two-letter label)
                if (this.matchedPrefix) {
                    // Look for a two-letter match
                    // Second letter can be typed in any case since prefix mode already indicates label intent
                    const fullLabel = this.matchedPrefix + normalizedKey.toLowerCase();
                    const match = this.matches.find(m => m.letter === fullLabel);

                    if (match) {
                        // Use capital position if EITHER key was shifted (prefix or this key)
                        const useCapital = this.prefixShiftHeld || shiftKey;
                        this.jumpToMatch(match, useCapital);
                        return;
                    }
                    // If no match with prefix, clear prefix and continue with search
                    this.matchedPrefix = '';
                    this.prefixShiftHeld = false;
                    // Fall through to add to search
                } else {
                    // First, check if adding this character would still produce matches
                    // Prioritize search extension over label selection for better UX
                    const potentialSearch = this.searchString + key;
                    const potentialMatches = this.detector.findMatches(potentialSearch);

                    if (potentialMatches.length > 0) {
                        // There are matches with extended search - add to search string
                        this.searchString = potentialSearch;
                        this.matches = potentialMatches;

                        // Auto-jump when exactly one match remains
                        if (this.matches.length === 1) {
                            const match = this.matches[0];
                            // Auto-jump uses current shift state
                            this.jumpToMatch(match, shiftKey);
                            return; // Exit early, jumpToMatch calls deactivate()
                        }

                        this.notifyDecorationUpdate();
                        return;
                    }

                    // No matches if we extend search - check if this is a label selection
                    const lowerKey = normalizedKey.toLowerCase();

                    // Check for single-letter label match
                    const exactMatch = this.matches.find(m => m.letter === lowerKey);
                    if (exactMatch) {
                        // Single-letter label - use current shift state
                        this.jumpToMatch(exactMatch, shiftKey);
                        return;
                    }

                    // Check for prefix match (two-letter labels starting with this key)
                    const prefixMatches = this.matches.filter(
                        m => m.letter.length === 2 && m.letter[0] === lowerKey
                    );

                    if (prefixMatches.length > 0) {
                        // Enter prefix mode - filter to just these matches
                        // Store shift state for this key (first of two-letter label)
                        this.matchedPrefix = lowerKey;
                        this.prefixShiftHeld = shiftKey;
                        this.matches = prefixMatches;
                        this.notifyDecorationUpdate();
                        return;
                    }

                    // Not a label and no matches - still add to search (will result in empty matches)
                    this.searchString = potentialSearch;
                    this.matches = [];
                    this.notifyDecorationUpdate();
                    return;
                }
            }

            // Add character to search string
            this.searchString += key;
            this.updateMatches();
        }
    }

    /**
     * Check if a key is a printable character.
     */
    private isPrintable(key: string): boolean {
        // Single character that's not a control character
        return key.length === 1;
    }

    /**
     * Update matches based on current search string.
     */
    private updateMatches(): void {
        // Clear matches if below minimum character count
        if (this.searchString.length < this.settings.flashCharacterCount) {
            this.matches = [];
            this.notifyDecorationUpdate();
            return;
        }

        // Find new matches
        this.matches = this.detector.findMatches(this.searchString);

        // Auto-jump when exactly one match remains
        if (this.matches.length === 1) {
            const match = this.matches[0];
            // Use lastShiftKey for auto-jump triggered by search
            this.jumpToMatch(match, this.lastShiftKey);
            return; // Exit early, jumpToMatch calls deactivate()
        }

        this.notifyDecorationUpdate();
    }

    /**
     * Notify decoration callback of match changes and update search panel.
     */
    private notifyDecorationUpdate(): void {
        // Update search panel with current search string
        this.searchPanel?.update(this.searchString);

        if (this.onDecorationUpdate) {
            this.onDecorationUpdate(this.matches, this.searchString.length, this.matchedPrefix);
        }
    }

    /**
     * Jump to a matched position.
     * Calculates final cursor position based on flashJumpPosition setting.
     * @param match The match to jump to
     * @param useCapital Whether to use the capital (uppercase) jump position setting
     */
    private jumpToMatch(match: FlashMatch, useCapital: boolean = false): void {
        const jumpPosition = this.calculateJumpPosition(match, useCapital);

        // If we have a callback, use it for the jump
        if (this.onJump) {
            this.onJump(jumpPosition);
        } else {
            // Fallback: Move cursor to match position directly
            this.editor.dispatch({
                selection: { anchor: jumpPosition }
            });
        }

        // Deactivate after jump
        this.deactivate();
    }

    /**
     * Calculate the final jump position based on the setting.
     * @param match The match to calculate position for
     * @param useCapital Whether to use the capital (uppercase) jump position setting
     */
    private calculateJumpPosition(match: FlashMatch, useCapital: boolean = false): number {
        const setting = useCapital
            ? this.settings.flashJumpPositionCapital
            : this.settings.flashJumpPosition;
        const matchStart = match.index;
        const matchEnd = match.index + match.matchLength;

        switch (setting) {
            case 'match-start':
                return matchStart;

            case 'match-end':
                return matchEnd - 1;

            case 'after-match-end':
                return matchEnd;

            case 'word-start':
                return this.findWordStart(matchStart);

            case 'word-end':
                return this.findWordEnd(matchEnd);

            case 'after-word-end':
                return this.findWordEnd(matchEnd) + 1;

            default:
                return matchStart;
        }
    }

    /**
     * Find the start of the word containing or before the given position.
     * Uses Unicode word boundaries.
     * Uses sliceString for efficiency (avoids converting entire document to string).
     */
    private findWordStart(pos: number): number {
        const doc = this.editor.state.doc;
        // Use a reasonable buffer size for word boundary search (most words < 100 chars)
        const bufferSize = 100;
        const searchStart = Math.max(0, pos - bufferSize);
        const content = doc.sliceString(searchStart, pos);

        // Search backwards for a non-word character
        let offset = content.length;
        while (offset > 0) {
            const char = content[offset - 1];
            // Unicode word character pattern: letters, numbers, underscore
            if (!/[\p{L}\p{N}_]/u.test(char)) {
                break;
            }
            offset--;
        }
        return searchStart + offset;
    }

    /**
     * Find the end of the word containing or after the given position.
     * Uses Unicode word boundaries.
     * Uses sliceString for efficiency (avoids converting entire document to string).
     */
    private findWordEnd(pos: number): number {
        const doc = this.editor.state.doc;
        const docLen = doc.length;
        // Use a reasonable buffer size for word boundary search (most words < 100 chars)
        const bufferSize = 100;
        const searchEnd = Math.min(docLen, pos + bufferSize);
        const content = doc.sliceString(pos, searchEnd);

        // Search forwards for a non-word character
        let offset = 0;
        while (offset < content.length) {
            const char = content[offset];
            // Unicode word character pattern: letters, numbers, underscore
            if (!/[\p{L}\p{N}_]/u.test(char)) {
                break;
            }
            offset++;
        }
        return pos + offset;
    }

    /**
     * Apply dimming class to content element.
     */
    private applyDimming(): void {
        if (this.view?.contentEl) {
            this.view.contentEl.classList.add('flash-active');
        }
    }

    /**
     * Remove dimming class from content element.
     */
    private removeDimming(): void {
        if (this.view?.contentEl) {
            this.view.contentEl.classList.remove('flash-active');
        }
    }

    /**
     * Register keyboard event handler.
     */
    private registerKeyHandler(): void {
        this.keydownHandler = (event: KeyboardEvent) => {
            if (event.isComposing || event.key === 'Process') {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.handleKeyDown(event.key, event.shiftKey);
        };

        if (this.view?.contentEl) {
            this.view.contentEl.addEventListener('keydown', this.keydownHandler, { capture: true });
        }
    }

    /**
     * Unregister keyboard event handler.
     */
    private unregisterKeyHandler(): void {
        if (this.keydownHandler && this.view?.contentEl) {
            this.view.contentEl.removeEventListener('keydown', this.keydownHandler, { capture: true });
            this.keydownHandler = null;
        }
    }

    /**
     * Register click event handler to exit Flash mode on click.
     */
    private registerClickHandler(): void {
        this.clickHandler = (event: MouseEvent) => {
            // Any click while Flash is active should exit the mode
            this.deactivate();
        };

        if (this.view?.contentEl) {
            this.view.contentEl.addEventListener('click', this.clickHandler, { capture: true });
        }
    }

    /**
     * Unregister click event handler.
     */
    private unregisterClickHandler(): void {
        if (this.clickHandler && this.view?.contentEl) {
            this.view.contentEl.removeEventListener('click', this.clickHandler, { capture: true });
            this.clickHandler = null;
        }
    }
}
