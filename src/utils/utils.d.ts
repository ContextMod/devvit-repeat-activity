import { Comment, Post } from "@devvit/public-api";
import { PostV2, CommentV2 } from '@devvit/protos';
export declare const parseUsableLinkIdentifier: (regexes?: RegExp[]) => (val?: string) => (string | undefined);
export declare const isRedditMedia: (act: Comment | Post) => boolean;
export declare const isExternalUrlSubmission: (act: Comment | Post) => boolean;
export declare const isPost: (value: any) => boolean;
export declare const asPostClass: (value: any) => value is Post;
export declare const asPostV2: (value: any) => value is PostV2;
export declare const asPost: (value: any) => value is Post | PostV2;
export type PostType = Post | PostV2;
export type CommentType = Comment | CommentV2;
export interface StringComparisonOptions {
    lengthWeight?: number;
    transforms?: ((str: string) => string)[];
}
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
export type CompareValueOrPercent = string;
export type StringOperator = '>' | '>=' | '<' | '<=';
export interface GenericComparison extends HasDisplayText {
    operator: StringOperator;
    value: number;
    isPercent: boolean;
    extra?: string;
    groups?: Record<string, string>;
    displayText: string;
}
export interface HasDisplayText {
    displayText: string;
}
export declare const parseGenericValueComparison: (val: string, options?: {
    reg?: RegExp;
}) => GenericComparison;
export declare const comparisonTextOp: (val1: number, strOp: string, val2: number) => boolean;
export declare const PASS = "\u2713";
export declare const FAIL = "\u2718";
//# sourceMappingURL=utils.d.ts.map