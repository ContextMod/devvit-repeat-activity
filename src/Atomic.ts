import {Comment, Post} from "@devvit/public-api";
import {CommentV2, PostV2} from "@devvit/protos";

/**
 * A stateful object for keeping track of a set of consecutively found content that is the same
 * */
export interface RepeatActivityData {
    /**
     * A deterministic string id, built from activity content to identify the content of all Activities in the set
     *
     * NOTE: All content may not be *exactly* the same across all sets, based on stringSameness. The identifier is the first occurrence found.
     * */
    identifier: string,
    sets: Activity[]
}

export interface RepeatActivityReducer {
    /**
     * All sets that could currently be added to (they are "on a roll")
     *
     * That is, they have activity that was JUST seen and the next iteration would be considered consecutive (within gapAllowance tolerance) if the identifier is the same
     * */
    openSets: RepeatActivityData[]

    /**
     * All sets that are current CLOSED. Their identifiers have not been seen recently (within gapAllowance tolerance)
     *
     * Sets in this list cannot be added to.
     * */
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
     * Should removed Activities be counted?
     * */
    keepRemoved: boolean

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

export interface RepeatCheckResult {
    triggered: boolean
    result: string
    summary: SummaryData[]
}

export type CreateModNoteOpts = {
    user: string
    subreddit: string
}
export const DEFAULT_THRESHOLD = 3;
export const DEFAULT_SUB_REMOVE_TRIGGER = false;
export const DEFAULT_SUB_MODNOTE_TRIGGER = false;
export const DEFAULT_SUB_THRESHOLD = 3;
export const DEFAULT_COM_REMOVE_TRIGGER = false;
export const DEFAULT_COM_MODNOTE_TRIGGER = false;
export const DEFAULT_COM_THRESHOLD = 3;
export const DEFAULT_IGNORE_MODS = true;
export const DEFAULT_IGNORE_AUTOMOD = true;
export const DEFAULT_IGNORE_APPROVED = true;
export const DEFAULT_KEEP_REMOVED = false;
