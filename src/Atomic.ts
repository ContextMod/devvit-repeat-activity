import {Comment, Post} from "@devvit/public-api";
import {CommentV2, PostV2} from "@devvit/protos";

export interface RepeatActivityData {
    identifier: string,
    sets: Activity[]
}

export interface RepeatActivityReducer {
    openSets: RepeatActivityData[]
    allSets: RepeatActivityData[]
}

export type GroupedActivities = Map<string, Activity[][]>;

export interface SummaryData {
    identifier: string,
    totalSets: number,
    totalTriggeringSets: number,
    largestTrigger: number,
    sets: Activity[][],
    setsMarkdown: string[],
    triggeringSets: Activity[][],
    triggeringSetsMarkdown: string[]
}

export interface CompareOptions {
    minWordCount: number
    gapAllowance: number
    matchScore: number

    useSubmissionAsReference: boolean

    threshold: string
}

export type PostType = Post | PostV2;
export type CommentType = Comment | CommentV2;

export type Activity = Post | Comment;

export interface StringComparisonOptions {
    lengthWeight?: number,
    transforms?: ((str: string) => string)[]
}

export type CompareValueOrPercent = string;

export interface HasDisplayText {
    displayText: string
}

export const PASS = '✓';
export const FAIL = '✘';
export type StringOperator = '>' | '>=' | '<' | '<=';

export interface GenericComparison extends HasDisplayText {
    operator: StringOperator,
    value: number,
    isPercent: boolean,
    extra?: string,
    groups?: Record<string, string> | undefined
    displayText: string,
}

export interface RepeatCheckResult {
    triggered: boolean
    result: string
    summary: SummaryData[]
}
