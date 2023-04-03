import {Comment, Post} from "@devvit/public-api";
import {PostV2} from '@devvit/protos';
import calculateCosineSimilarity from "./StringMatching/CosineSimilarity.js";
import levenSimilarity from "./StringMatching/levenSimilarity.js";
import stringSimilarity from 'string-similarity';
import {GenericComparison, StringComparisonOptions, StringOperator} from "../Atomic.js";

/**
 * @see https://stackoverflow.com/a/61033353/1469797
 */
const REGEX_YOUTUBE: RegExp = /(?:https?:\/\/)?(?:www\.)?youtu(?:\.be\/|be.com\/\S*(?:watch|embed)(?:(?:(?=\/[^&\s\?]+(?!\S))\/)|(?:\S*v=|v\/)))([^&\s\?]+)/g;

export const parseUsableLinkIdentifier = (regexes: RegExp[] = [REGEX_YOUTUBE]) => (val?: string): (string | undefined) => {
    if (val === undefined) {
        return val;
    }
    for (const reg of regexes) {
        const matches = [...val.matchAll(reg)];
        if (matches.length > 0) {
            // use first capture group
            // TODO make this configurable at some point?
            const captureGroup = matches[0][matches[0].length - 1];
            if (captureGroup !== '') {
                return captureGroup;
            }
        }
    }
    return val;
}

export const isRedditMedia = (act: Comment | Post): boolean => {
    return act instanceof Post && (
        //act.is_reddit_media_domain ||
        //act.is_video ||
        ['v.redd.it', 'i.redd.it'].includes(act.url)
    );
}

export const isExternalUrlSubmission = (act: Comment | Post): boolean => {
    return act instanceof Post
        && ['redd.it', 'reddit.com'].every(x => !act.url.includes(x))
        && !isRedditMedia(act);
}

export const isPost = (value: any) => {
    try {
        return asPostClass(value) || asPostV2(value);
    } catch (e) {
        return false;
    }
}

export const asPostClass = (value: any): value is Post => {
    return value instanceof Post;
}


export const asPostV2 = (value: any): value is PostV2 => {
    return value !== null && typeof value === 'object' && !(value instanceof Post) && 'id' in value && value.id.includes('t3_');
}

export const asPost = (value: any): value is (Post | PostV2) => {
    return isPost(value);
}

// export const toPost = (value: Post | PostSubmit): Post => {
//     if(value instanceof Post) {
//         return value;
//     }
//     return new Post(value.post as PostV2)
// }

export const defaultStrCompareTransformFuncs = [
    // lower case to remove case sensitivity
    (str: string) => str.toLocaleLowerCase(),
    // remove excess whitespace
    (str: string) => str.trim(),
    // remove non-alphanumeric characters so that differences in punctuation don't subtract from comparison score
    (str: string) => str.replace(/[^A-Za-z0-9 ]/g, ""),
    // replace all instances of 2 or more whitespace with one whitespace
    (str: string) => str.replace(/\s{2,}|\n/g, " ")
];

const sentenceLengthWeight = (length: number) => {
    // thanks jordan :')
    // constants are black magic
    return (Math.log(length) / 0.20) - 5;
}


export const stringSameness = (valA: string, valB: string, options?: StringComparisonOptions) => {

    const {
        transforms = defaultStrCompareTransformFuncs,
    } = options || {};

    const cleanA = transforms.reduce((acc, curr) => curr(acc), valA);
    const cleanB = transforms.reduce((acc, curr) => curr(acc), valB);

    const shortest = cleanA.length > cleanB.length ? cleanB : cleanA;

    // Dice's Coefficient
    const dice = stringSimilarity.compareTwoStrings(cleanA, cleanB) * 100;
    // Cosine similarity
    const cosine = calculateCosineSimilarity(cleanA, cleanB) * 100;
    // Levenshtein distance
    const [levenDistance, levenSimilarPercent] = levenSimilarity(cleanA, cleanB);

    // use shortest sentence for weight
    const weightScore = sentenceLengthWeight(shortest.length);

    // take average score
    const highScore = (dice + cosine + levenSimilarPercent) / 3;
    // weight score can be a max of 15
    const highScoreWeighted = highScore + Math.min(weightScore, 15);
    return {
        scores: {
            dice,
            cosine,
            leven: levenSimilarPercent
        },
        highScore,
        highScoreWeighted,
    }
}

export const GENERIC_VALUE_COMPARISON = /^\s*(?<opStr>>|>=|<|<=)\s*(?<value>-?(?:\d+)(?:(?:(?:.|,)\d+)+)?)(?<extra>\s+.*)*$/
export const GENERIC_VALUE_COMPARISON_URL = 'https://regexr.com/6vama';

export const parseGenericValueComparison = (val: string, options?: {
    reg?: RegExp
}): GenericComparison => {

    const {
        reg = GENERIC_VALUE_COMPARISON,
    } = options || {};

    const matches = val.match(reg);

    if (matches === null) {
        throw new Error(`Could not parse ${val} as comparison`);
    }

    const groups = matches.groups as any;

    const displayParts = [`${groups.opStr} ${groups.value}`];
    const hasPercent = typeof groups.percent === 'string' && groups.percent.trim() !== '';
    if (hasPercent) {
        displayParts.push('%');
    }

    const {
        opStr,
        value,
        percent,
        extra,
        ...rest
    } = matches.groups || {};

    const extraGroups: Record<string, string> = {};
    let hasExtraGroups = false;

    for (const [k, v] of Object.entries(rest)) {
        if (typeof v === 'string' && v.trim() !== '') {
            extraGroups[k] = v;
            hasExtraGroups = true;
        }
    }

    return {
        operator: groups.opStr as StringOperator,
        value: Number.parseFloat(groups.value),
        isPercent: hasPercent,
        extra: groups.extra,
        groups: hasExtraGroups ? extraGroups : undefined,
        displayText: displayParts.join(''),
    }
}

export const comparisonTextOp = (val1: number, strOp: string, val2: number): boolean => {
    switch (strOp) {
        case '>':
            return val1 > val2;
        case '>=':
            return val1 >= val2;
        case '<':
            return val1 < val2;
        case '<=':
            return val1 <= val2;
        default:
            throw new Error(`${strOp} was not a recognized operator`);
    }
}

