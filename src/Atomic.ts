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
    /**
     * The number of word-like tokens that must be found in a piece of content to consider it for comparison.
     * */
    minWordCount: number
    /**
     * The number of non-repeat pieces of content allowed between "repeat" content where the bot will still count content as "still being repeated"
     * */
    gapAllowance: number
    /**
     * A score of 0 to 100 for testing how similar to pieces of content are.
     *
     * 0 is completely different, 100 is identical
     *
     * A content is considered repeated if its score is at or above matchScore with the content it is being compared to
     * */
    matchScore: number

    /**
     * When set to true sets of repeated content found are filtered so only those matching the comment/post being filtered are returned
     * */
    useProcessingAsReference: boolean

    /**
     * A comparison string for testing how many pieces of content need to be repeated to trigger the bots
     *
     * EX: '>= 3' => '3 or more repeated pieces of content trigger the bot'
     * */
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

export type CreateModNoteOpts = {
    user: string
    subreddit: string
}
