import { pinyin } from "pinyin-pro";

export interface RawFlashMatch {
    index: number;
    matchLength: number;
    linkText: string;
}

interface CharInfo {
    char: string;
    start: number;
    end: number;
}

interface PyjjToken {
    type: 'pair' | 'single';
    value: string;
}

const TONE_TO_ASCII: Readonly<Record<string, string>> = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v',
    'ü': 'v', 'ń': 'n', 'ň': 'n', 'ǹ': 'n'
};

function normalizePinyin(raw: string): string {
    if (!raw) {
        return '';
    }

    let normalized = '';
    for (const char of raw.toLowerCase()) {
        normalized += TONE_TO_ASCII[char] ?? char;
    }

    return normalized
        .replace(/u:/g, 'v')
        .replace(/[^a-zv]/g, '');
}

function pinyinToPyjjCodes(input: string): string[] {
    const base = normalizePinyin(input);
    if (!base) {
        return [];
    }

    const forms = [base];
    const matchJqxyU = base.match(/^([jqxy])u$/);
    if (matchJqxyU) {
        forms.push(`${matchJqxyU[1]}v`);
    }
    if (/^[aoe]/.test(base)) {
        forms.push(`o${base}`);
    }

    const output: string[] = [];
    const seen = new Set<string>();

    for (const originalForm of forms) {
        let form = originalForm;

        const aeLeading = form.match(/^([ae])(.*)$/);
        if (aeLeading) {
            form = `${aeLeading[1]}${aeLeading[1]}${aeLeading[2]}`;
        }

        form = form.replace(/iu$/, 'N');
        form = form.replace(/[iu]a$/, 'B');
        form = form.replace(/er$/, 'Q');
        form = form.replace(/ing$/, 'Q');
        form = form.replace(/[uv]an$/, 'C');
        form = form.replace(/[uv]e$/, 'X');
        form = form.replace(/uai$/, 'X');

        form = form.replace(/^sh/, 'I');
        form = form.replace(/^ch/, 'U');
        form = form.replace(/^zh/, 'V');

        form = form.replace(/uo$/, 'O');
        form = form.replace(/[uv]n$/, 'Z');
        form = form.replace(/iong$/, 'Y');
        form = form.replace(/ong$/, 'Y');
        form = form.replace(/[iu]ang$/, 'H');
        form = form.replace(/(.)en$/, '$1R');
        form = form.replace(/(.)eng$/, '$1T');
        form = form.replace(/(.)ang$/, '$1G');
        form = form.replace(/ian$/, 'J');
        form = form.replace(/(.)an$/, '$1F');
        form = form.replace(/iao$/, 'K');
        form = form.replace(/(.)ao$/, '$1D');
        form = form.replace(/(.)ai$/, '$1S');
        form = form.replace(/(.)ei$/, '$1W');
        form = form.replace(/ie$/, 'M');
        form = form.replace(/ui$/, 'V');
        form = form.replace(/(.)ou$/, '$1P');
        form = form.replace(/in$/, 'L');

        form = form.toLowerCase();
        if (form.length !== 2 || seen.has(form)) {
            continue;
        }

        seen.add(form);
        output.push(form);
    }

    return output;
}

function parsePyjjTokens(input: string): PyjjToken[] | null {
    if (!/^[a-zA-Z]+$/.test(input)) {
        return null;
    }

    const value = input.toLowerCase();
    const tokens: PyjjToken[] = [];

    for (let index = 0; index < value.length; index += 2) {
        const token = value.slice(index, index + 2);
        if (!token) {
            continue;
        }
        if (token.length === 1) {
            tokens.push({ type: 'single', value: token });
        } else {
            tokens.push({ type: 'pair', value: token });
        }
    }

    return tokens;
}

function isHanCharacter(char: string): boolean {
    return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(char);
}

function getPyjjCodesForChar(char: string, cache: Map<string, string[]>): string[] {
    const cached = cache.get(char);
    if (cached) {
        return cached;
    }

    if (!isHanCharacter(char)) {
        cache.set(char, []);
        return [];
    }

    const details = pinyin(char, { type: 'all', toneType: 'none', v: true }) as Array<{
        result?: string;
        polyphonic?: string[];
        isZh?: boolean;
    }>;
    if (!Array.isArray(details) || details.length === 0 || !details[0]?.isZh) {
        cache.set(char, []);
        return [];
    }

    const allPinyins = new Set<string>();
    const candidates = [details[0].result || '', ...(details[0].polyphonic || [])];
    for (const candidate of candidates) {
        const normalized = normalizePinyin(candidate);
        if (normalized) {
            allPinyins.add(normalized);
        }
    }

    const codes = new Set<string>();
    for (const py of allPinyins) {
        for (const code of pinyinToPyjjCodes(py)) {
            codes.add(code);
        }
    }

    const result = Array.from(codes);
    cache.set(char, result);
    return result;
}

function buildCharInfos(content: string): CharInfo[] {
    const chars: CharInfo[] = [];
    let offset = 0;
    for (const char of content) {
        const start = offset;
        const end = start + char.length;
        chars.push({ char, start, end });
        offset = end;
    }
    return chars;
}

function matchesToken(char: string, token: PyjjToken, cache: Map<string, string[]>): boolean {
    const codes = getPyjjCodesForChar(char, cache);
    if (codes.length === 0) {
        return false;
    }

    if (token.type === 'pair') {
        return codes.includes(token.value);
    }

    return codes.some(code => code.startsWith(token.value));
}

export function findPyjjMatchesInContent(
    searchString: string,
    content: string,
    baseIndex: number,
    cache: Map<string, string[]>
): RawFlashMatch[] {
    const tokens = parsePyjjTokens(searchString);
    if (!tokens || tokens.length === 0) {
        return [];
    }

    const chars = buildCharInfos(content);
    if (chars.length < tokens.length) {
        return [];
    }

    const matches: RawFlashMatch[] = [];

    for (let start = 0; start <= chars.length - tokens.length; start++) {
        let cursor = start;
        let ok = true;

        for (const token of tokens) {
            const info = chars[cursor];
            if (!info || !matchesToken(info.char, token, cache)) {
                ok = false;
                break;
            }
            cursor++;
        }

        if (!ok) {
            continue;
        }

        const startOffset = chars[start].start;
        const endOffset = chars[cursor - 1].end;
        const text = content.slice(startOffset, endOffset);
        matches.push({
            index: baseIndex + startOffset,
            matchLength: endOffset - startOffset,
            linkText: text
        });
    }

    return matches;
}
