import {
    asPost,
    isExternalUrlSubmission,
    isRedditMedia,
    parseUsableLinkIdentifier,
    stringSameness
} from "./utils/utils.js";
import {Comment, Post} from "@devvit/public-api";
import {Activity, CompareOptions, RepeatActivityData, RepeatActivityReducer} from "./Atomic.js";

const parseIdentifier = parseUsableLinkIdentifier();
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
export const condenseActivities = (activities: (Post | Comment)[], opts: CompareOptions) => activities.reduce(async (accProm: Promise<RepeatActivityReducer>, activity: (Post | Comment), index: number) => {
    const acc = await accProm;
    const {openSets = [], allSets = []} = acc;

    const {
        minWordCount,
        gapAllowance,
        matchScore
    } = opts;

    let identifier = getActivityIdentifier(activity);

    const isUrl = isExternalUrlSubmission(activity);
    //let fu = new Fuse([identifier], !isUrl ? fuzzyOptions : {...fuzzyOptions, distance: 5});
    const validSub = true;//await this.activityFilterFunc(activity, item.author);
    let minMet = identifier.length >= minWordCount;

    let updatedAllSets = [...allSets];
    let updatedOpenSets: RepeatActivityData[] = [];

    let currIdentifierInOpen = false;
    const bufferedActivities = gapAllowance === 0 ? [] : activities.slice(Math.max(0, index - gapAllowance), Math.max(0, index));
    for (const o of openSets) {
        const strMatchResults = stringSameness(o.identifier, identifier);
        if (strMatchResults.highScoreWeighted >= matchScore && minMet) {
            updatedOpenSets.push({...o, sets: [...o.sets, activity]});
            currIdentifierInOpen = true;
        } else if (bufferedActivities.some(x => {
            let buffIdentifier = getActivityIdentifier(x);
            const buffMatch = stringSameness(identifier, buffIdentifier);
            return buffMatch.highScoreWeighted >= matchScore;
        }) && validSub && minMet) {
            updatedOpenSets.push(o);
        } else if (!currIdentifierInOpen && !isUrl) {
            updatedAllSets.push(o);
        }
    }

    if (!currIdentifierInOpen) {
        updatedOpenSets.push({identifier, sets: [activity]})

        if (isUrl) {
            // could be that a spammer is using different URLs for each submission but similar submission titles so search by title as well
            const sub = activity as Post;
            identifier = sub.title;
            //fu = new Fuse([identifier], !isUrl ? fuzzyOptions : {...fuzzyOptions, distance: 5});
            minMet = identifier.length >= minWordCount;
            for (const o of openSets) {
                const strMatchResults = stringSameness(o.identifier, identifier);
                if (strMatchResults.highScoreWeighted >= matchScore && minMet) {
                    updatedOpenSets.push({...o, sets: [...o.sets, activity]});
                    currIdentifierInOpen = true;
                } else if (bufferedActivities.some(x => {
                    let buffIdentifier = getActivityIdentifier(x);
                    const buffMatch = stringSameness(identifier, buffIdentifier);
                    return buffMatch.highScoreWeighted >= matchScore;
                }) && validSub && minMet && !updatedOpenSets.includes(o)) {
                    updatedOpenSets.push(o);
                } else if (!updatedAllSets.includes(o)) {
                    updatedAllSets.push(o);
                }
            }

            if (!currIdentifierInOpen) {
                updatedOpenSets.push({identifier, sets: [activity]})
            }
        }
    }

    return {openSets: updatedOpenSets, allSets: updatedAllSets};

}, Promise.resolve({openSets: [], allSets: []}));

export const extractApplicableGroupedActivities = (condensedActivities: RepeatActivityReducer, opts: CompareOptions, item?: Activity) => {
    const allRepeatSets = [...condensedActivities.allSets, ...condensedActivities.openSets];

    const identifierGroupedActivities = allRepeatSets.reduce((acc, repeatActivityData) => {
        let existingSets: Activity[][] = [];
        if (acc.has(repeatActivityData.identifier)) {
            existingSets = acc.get(repeatActivityData.identifier) as Activity[][];
        }
        acc.set(repeatActivityData.identifier, [...existingSets, repeatActivityData.sets].sort((a, b) => b.length < a.length ? 1 : -1));
        return acc;
    }, new Map<string, Activity[][]>());

    let applicableGroupedActivities = identifierGroupedActivities;

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
