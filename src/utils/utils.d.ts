import { Comment, Post } from "@devvit/public-api";
import { PostV2 } from '@devvit/protos';
import { GenericComparison, StringComparisonOptions } from "../Atomic.js";
export declare const parseUsableLinkIdentifier: (regexes?: RegExp[]) => (val?: string) => (string | undefined);
export declare const isRedditMedia: (act: Comment | Post) => boolean;
export declare const isExternalUrlSubmission: (act: Comment | Post) => boolean;
export declare const isPost: (value: any) => boolean;
export declare const asPostClass: (value: any) => value is Post;
export declare const asPostV2: (value: any) => value is PostV2;
export declare const asPost: (value: any) => value is Post | PostV2;
export declare const defaultStrCompareTransformFuncs: ((str: string) => string)[];
export declare const stringSameness: (valA: string, valB: string, options?: StringComparisonOptions) => {
    scores: {
        dice: number;
        cosine: number;
        leven: number;
    };
    highScore: number;
    highScoreWeighted: number;
};
export declare const GENERIC_VALUE_COMPARISON: RegExp;
export declare const GENERIC_VALUE_COMPARISON_URL = "https://regexr.com/6vama";
export declare const parseGenericValueComparison: (val: string, options?: {
    reg?: RegExp;
}) => GenericComparison;
export declare const comparisonTextOp: (val1: number, strOp: string, val2: number) => boolean;
//# sourceMappingURL=utils.d.ts.map