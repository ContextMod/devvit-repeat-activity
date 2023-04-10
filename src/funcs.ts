import {asPost, isExternalUrlSubmission, isRedditMedia, parseUsableLinkIdentifier} from "./utils/utils.js";
import {Comment, Post} from "@devvit/public-api";
import {
    Activity,
    CompareOptions,
    GroupedActivities,
    RepeatActivityData,
    RepeatActivityReducer,
    RepeatCheckResult,
    SummaryData
} from "./Atomic.js";
import {comparisonTextOp, parseGenericValueComparison} from "@foxxmd/common-libs/functions";
import {FAIL, PASS} from "@foxxmd/common-libs/atomic";
import {stringSameness} from "@foxxmd/string-sameness";
// import {ConfigField, ConfigFieldType} from "@devvit/protos/types/devvit/actor/user_configurable/user_configurable.js";
// import {ContextActionRequest} from "@devvit/protos/types/devvit/actor/reddit/context_action.js";
import {ConfigField, ConfigFieldType, ContextActionRequest, ContextType, RedditObject} from '@devvit/protos';

const parseIdentifier = parseUsableLinkIdentifier();
/**
 * Extract a deterministic subset of an Activity's text to use for comparison.
 *
 * * When Post =>
 *   * If self-post (or link with body) use the Post's title + slice of the body text
 *   * If reddit-hosted media (i.reddit, v.reddit) only use title because media urls are always unique
 *   * If link (no body) use URL only because it is much easier to make a variation on a Post title than it is to make proxy/variant URLs
 * * When comment =>
 *   * Use slice of body
 * */
export const getActivityIdentifier = (activity: (Post | Comment), length = 200) => {
    let identifier: string;
    if (asPost(activity)) {
        if (activity.body !== undefined) {
            identifier = `${activity.title}${activity.body.slice(0, length)}`;
        } else if (isRedditMedia(activity)) {
            identifier = activity.title;
        } else {
            identifier = parseIdentifier(activity.url) as string;
        }
    } else {
        identifier = activity.body.slice(0, length);
    }

    return identifier.toLowerCase();
}
/**
 * Iterates through Activities in order. Keeps track of last seen identifier and builds "sets" of "same" Activities as it iterates
 *
 * A set (RepeatActivityData) consists of:
 *   * An Activity Identifier
 *   * SETS of sets
 *     * One set = 1 or more activities, found consecutively in the list of activities given, that have matching Activity Identifiers
 *     * Sets of sets b/c we may find consecutive activities of the same identifier in different parts of the list
 *       * IE user posts 3x same content, then 4 unique posts, then another 3x same content
 * */
export const condenseActivities = (activities: (Post | Comment)[], opts: CompareOptions) => activities.reduce(async (accProm: Promise<RepeatActivityReducer>, activity: (Post | Comment), index: number) => {
    // if we need to await for some activity/subreddit info in the future this sets it up to be easy
    const acc = await accProm;
    // create defaults for empty RepeatActivityReducer
    const {openSets = [], allSets = []} = acc;

    const {
        minWordCount,
        gapAllowance,
        matchScore
    } = opts;

    // get identifier for current activity
    let identifier = getActivityIdentifier(activity);

    const isUrl = isExternalUrlSubmission(activity);

    // not currently able to filter by sub (need app-level config)
    const validSub = true;//await this.activityFilterFunc(activity, item.author);

    // check that the activity's content is at least as long as the minimum word count
    let minMet = identifier.length >= minWordCount;

    // so we don't modify existing sets :)
    let updatedAllSets = [...allSets];

    // on each iteration rebuild open sets from SCRATCH
    // sets that are currently open are only re-added to open if the current activity being processed matches its identifier
    // OR its identifier is in bufferedActivities
    let updatedOpenSets: RepeatActivityData[] = [];

    let currIdentifierInOpen = false;
    // this is based on gapAllowance...we check if the open set identifier is "within" # number of buffered activities so we can "ignore" the current activity that does not match it
    // and still keep the set open
    const bufferedActivities = gapAllowance === 0 ? [] : activities.slice(Math.max(0, index - gapAllowance), Math.max(0, index));

    // iterate each open set and check if its identifier matches the current activity
    for (const o of openSets) {
        const strMatchResults = stringSameness(o.identifier, identifier);

        if (strMatchResults.highScoreWeighted >= matchScore && minMet) {
            // if current activity matches identifier then push current activity into open set and add set to open sets (from scratch)
            updatedOpenSets.push({...o, sets: [...o.sets, activity]});
            currIdentifierInOpen = true;

        } else if (bufferedActivities.some(x => {
            let buffIdentifier = getActivityIdentifier(x);
            const buffMatch = stringSameness(identifier, buffIdentifier);
            return buffMatch.highScoreWeighted >= matchScore;
        }) && validSub && minMet) {
            // open set identifier DID NOT match current activity
            // BUT it did match an activity from the buffer created by gapAllowance which allows us to keep this set open
            updatedOpenSets.push(o);

        } else if (!currIdentifierInOpen && !isUrl) {
            // open set did not match identifier AND current activity is not a link Post (self-post or reddit media)
            // so close the set by pushing to all sets
            // -- for link Posts we do another identifier match attempt ignoring URL below
            updatedAllSets.push(o);
        }
    }

    if (!currIdentifierInOpen) {
        // current activity identifier did not match any open sets so create a new open set for this specific identifier
        updatedOpenSets.push({identifier, sets: [activity]})

        if (isUrl) {
            // could be that a spammer is using different URLs for each submission but similar submission titles so search by title as well
            const sub = activity as Post;
            // use only title rather than only URL
            identifier = sub.title;

            minMet = identifier.length >= minWordCount;
            for (const o of openSets) {
                const strMatchResults = stringSameness(o.identifier, identifier);

                if (strMatchResults.highScoreWeighted >= matchScore && minMet) {
                    // if current activity title matches identifier then push current activity into open set and add set to open sets (from scratch)
                    updatedOpenSets.push({...o, sets: [...o.sets, activity]});
                    currIdentifierInOpen = true;

                } else if (bufferedActivities.some(x => {
                    let buffIdentifier = getActivityIdentifier(x);
                    const buffMatch = stringSameness(identifier, buffIdentifier);
                    return buffMatch.highScoreWeighted >= matchScore;
                }) && validSub && minMet && !updatedOpenSets.includes(o)) {
                    // open set identifier DID NOT match current activity title
                    // BUT it did match an activity title from the buffer created by gapAllowance which allows us to keep this set open
                    // and we didn't create (or use an existing set) in the open sets from scratch
                    updatedOpenSets.push(o);
                } else if (!updatedAllSets.includes(o)) {
                    // if we didn't already close this set then add it now
                    updatedAllSets.push(o);
                }
            }

            // add another open set for title identifier ONLY
            if (!currIdentifierInOpen) {
                updatedOpenSets.push({identifier, sets: [activity]})
            }
        }
    }

    /**
     * At the end of iterating all activities we end up with a bunch of identifiers that consist of all consecutive content that matches its sameness
     * -- it may be that we have multiple RepeatActivityData objects with the same identifier as well (multiple instances of repeats through history but separated by unique content)
     * */
    return {openSets: updatedOpenSets, allSets: updatedAllSets};

}, Promise.resolve({openSets: [], allSets: []}));

/**
 * Responsible for consolidating open/closed sets so that a top level list consists of unique identifiers and sets of sets represented by that identifier
 *
 * Necessary because, within open/closed set lists,
 * it may be that we have multiple RepeatActivityData objects with the same identifier as well (multiple instances of repeats through history but separated by unique content)
 *
 * Additionally, if a reference Activity is given, then filter the consolidated list into only those sets of sets whose identifier matches the identifier of the reference Activity
 * */
export const extractApplicableGroupedActivities = (condensedActivities: RepeatActivityReducer, opts: CompareOptions, item?: Activity): GroupedActivities => {
    // flatten open/closed sets (all open sets are now closed anyway)
    const allRepeatSets = [...condensedActivities.allSets, ...condensedActivities.openSets];

    /**
     * reduce RepeatActivityData into GroupedActivities:
     *  * key is a unique activity identifier
     *  * value is SETS of sets of Activity -- each instance (list) of consecutive Activities found with the given identifier
     * */
    const identifierGroupedActivities = allRepeatSets.reduce((acc, repeatActivityData) => {
        let existingSets: Activity[][] = [];
        if (acc.has(repeatActivityData.identifier)) {
            existingSets = acc.get(repeatActivityData.identifier) as Activity[][];
        }
        acc.set(repeatActivityData.identifier, [...existingSets, repeatActivityData.sets].sort((a, b) => b.length < a.length ? 1 : -1));
        return acc;
    }, new Map<string, Activity[][]>());

    let applicableGroupedActivities = identifierGroupedActivities;

    // if a reference Activity was given then filter Map so only the key that matches the given Activity identifier remains
    if(item !== undefined) {
        applicableGroupedActivities = new Map();
        let identifier = getActivityIdentifier(item);
        // look for exact match first
        let referenceSubmissions = identifierGroupedActivities.get(identifier);
        if (referenceSubmissions === undefined) {
            if (isExternalUrlSubmission(item)) {
                // if external url sub then try by title
                identifier = (item as Post).title;
                referenceSubmissions = identifierGroupedActivities.get(identifier);
                if (referenceSubmissions === undefined) {
                    // didn't get by title so go back to url since that's the default
                    identifier = getActivityIdentifier(item);
                }
            } else if (asPost(item) && item.body !== undefined) {
                // if is self post then identifier is made up of title and body so identifiers may not be *exact* if title varies or body varies
                // -- try to find identifying sets by using string sameness on set identifiers
                let fuzzySets: Activity[][] = [];
                for (const [k, v] of identifierGroupedActivities.entries()) {
                    const strMatchResults = stringSameness(k, identifier);
                    if (strMatchResults.highScoreWeighted >= opts.matchScore) {
                        fuzzySets = fuzzySets.concat(v);
                    }
                }
                referenceSubmissions = [fuzzySets.flat()];
            }
        }

        applicableGroupedActivities.set(identifier, referenceSubmissions || [])
    }

    return applicableGroupedActivities;
}

/**
 * Compare test condition and compile summary information that can be used to render results to user
 * */
export const generateResult = (applicableGroupedActivities: GroupedActivities, opts: CompareOptions): RepeatCheckResult => {
    // determine test condition given by user
    const {operator, value: thresholdValue} = parseGenericValueComparison(opts.threshold);
    const greaterThan = operator.includes('>');
    let allLessThan = true;

    const identifiersSummary: SummaryData[] = [];
    // for each consolidate list of list of activities check against test condition and render human-friendly results
    for (let [key, value] of applicableGroupedActivities) {
        const summaryData: SummaryData = {
            identifier: key,
            totalSets: value.length,
            totalTriggeringSets: 0,
            largestTrigger: 0,
            sets: [],
            setsMarkdown: [],
            triggeringSets: [],
            triggeringSetsMarkdown: [],
        };
        for (let set of value) {
            // check condition against each list

            // tests condition against list length (number of repeats found, in this specific instance of repeats)
            const test = comparisonTextOp(set.length, operator, thresholdValue);
            const md = `${getActivityIdentifier(set[0], 50)} ${set.length === 1 ? 'found once' : `repeated ${set.length}x`} in ${set.map(x => `${asPost(x) ? x.title : x.parentId}`).join(', ')}`;

            summaryData.sets.push(set);
            // determine the largest list of repeated content for this identifier
            summaryData.largestTrigger = Math.max(summaryData.largestTrigger, set.length);
            summaryData.setsMarkdown.push(md);
            if (test) {
                summaryData.triggeringSets.push(set);
                summaryData.totalTriggeringSets++;
                summaryData.triggeringSetsMarkdown.push(md);
                // }
            } else if (!greaterThan) {
                allLessThan = false;
            }
        }
        identifiersSummary.push(summaryData);
    }

    // bot is triggered if we have any sets that passed the condition
    const criteriaMet = identifiersSummary.filter(x => x.totalTriggeringSets > 0).length > 0 && (greaterThan || (!greaterThan && allLessThan));

    // find largest repeat among all identifiers
    const largestRepeat = identifiersSummary.reduce((acc, summ) => Math.max(summ.largestTrigger, acc), 0);
    let result: string;
    if (criteriaMet || greaterThan) {
        result = `${criteriaMet ? PASS : FAIL} ${identifiersSummary.filter(x => x.totalTriggeringSets > 0).length} of ${identifiersSummary.length} unique items repeated ${opts.threshold} times, largest repeat: ${largestRepeat}`;
    } else {
        result = `${FAIL} Not all of ${identifiersSummary.length} unique items repeated ${opts.threshold} times, largest repeat: ${largestRepeat}`
    }

    return {
        triggered: criteriaMet,
        result,
        summary: identifiersSummary
    };
}

export const msgPrefix = (triggered: boolean, willRemove: boolean) => {
    if(willRemove) {
        return  triggered ? 'REMOVED =>' : 'NOT REMOVED =>';
    }
    return triggered ? 'TRIGGERED =>' : 'NOT TRIGGERED =>';
}

export interface GetUserInputOptions {
    /**
     * Useful if more than one field has the same key
     * */
    fieldTypeHint?: ConfigFieldType
    /**
     * numberField always default to 0. Treat 0 as undefined (no input)
     *
     * @default true
     * */
    zeroAsUndefined?: boolean
    /**
     * textField and textArea always default to an empty string. Treat empty string as undefined (no input)
     *
     * @default true
     * */
    emptyStringAsUndefined?: boolean
    /**
     * Value to return when form does not include field with the given name, or field value is "undefined"
     *
     * @default undefined
     * */
    onUndefined?: any
}

/**
 * Gets fields with the given name and parses their response to a normalized value
 *
 * * text fields always have response wrapped in double quotes: "My response" => removes double quotes and returns plain string
 * * boolean field response is a string "true" or "false" => parses and returns a true boolean value
 * * number fields response is a string number and always returns "0" if no user input => parses as true number value and optionally treats 0 as undefined
 *
 * return a tuple of [cleaned field value, raw found field data]
 * */
export const getUserInputFieldAndValue = <T>(action: ContextActionRequest, fieldName: string, opts?: GetUserInputOptions): [T | undefined, ConfigField | undefined] => {
    const {
        onUndefined = undefined,
        zeroAsUndefined = true,
        emptyStringAsUndefined = true,
        fieldTypeHint,
    } = opts || {};

    if (action.userInput === undefined || action.userInput.fields.length === 0) {
        return onUndefined;
    }
    let validFields = action.userInput.fields.filter(x => x.key.toLowerCase() === fieldName.toLowerCase());
    if (validFields.length > 1 && fieldTypeHint !== undefined) {
        validFields = validFields.filter(x => x.fieldType === fieldTypeHint);
    }
    if (validFields.length === 0) {
        return [undefined, undefined];
    }
    const field = validFields[0] as ConfigField;

    switch (field.fieldType) {
        case ConfigFieldType.NUMBER:
            const num = Number.parseInt(field.response);
            if (num === 0 && zeroAsUndefined) {
                return [undefined, field]
            }
            return [num as T, field];
        case ConfigFieldType.STRING:
        case ConfigFieldType.PARAGRAPH:
            const cleanString = field.response.replace(/^"/, '').replace(/"$/, ''); // remove double quotes at beginning and end of string
            if (cleanString === '' && emptyStringAsUndefined) {
                return [undefined, field];
            }
            return [cleanString as T, field];
        case ConfigFieldType.BOOLEAN:
            return [(field.response === 'true') as T, field];
        case ConfigFieldType.UNRECOGNIZED:
            return [field.response as T, field]
    }
}

/**
 * Uses getUserInputFieldAndValue() to parse field and returns only cleaned value as a convenience
 * */
export const getUserInputValue = <T>(action: ContextActionRequest, fieldName: string, opts?: GetUserInputOptions): T | undefined => {
    return getUserInputFieldAndValue(action, fieldName, opts)[0] as T | undefined;
}

export const authorIsModFromContext = (action: ContextActionRequest) => {
    if (action.context === ContextType.POST) {
        return (action.post as RedditObject).canModPost;
    } else if (action.context === ContextType.COMMENT) {
        return (action.comment as RedditObject).canModPost;
    } else if (action.context === ContextType.SUBREDDIT) {
        return action.subreddit?.userIsModerator;
    }
    return false;
}

export const authorNameFromContext = (action: ContextActionRequest) => {
    if (action.context === ContextType.POST) {
        return (action.post as RedditObject).author;
    } else if (action.context === ContextType.COMMENT) {
        return (action.comment as RedditObject).author;
    }
    return undefined;
}
