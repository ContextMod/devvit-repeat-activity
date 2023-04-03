import {Comment, Devvit, Post, RedditAPIClient} from '@devvit/public-api';

import {
    PostSubmit,
    Metadata,
} from '@devvit/protos';
import {
    asPost, comparisonTextOp, FAIL,
    isExternalUrlSubmission,
    isRedditMedia, parseGenericValueComparison,
    parseUsableLinkIdentifier, PASS, stringSameness,
} from "./utils.js";

const reddit = new RedditAPIClient();

interface RepeatActivityData {
    identifier: string,
    sets: (Post | Comment)[]
}

interface RepeatActivityReducer {
    openSets: RepeatActivityData[]
    allSets: RepeatActivityData[]
}

interface SummaryData {
    identifier: string,
    totalSets: number,
    totalTriggeringSets: number,
    largestTrigger: number,
    sets: (Comment | Post)[],
    setsMarkdown: string[],
    triggeringSets: (Comment | Post)[],
    triggeringSetsMarkdown: string[]
}

interface CompareOptions {
    minWordCount: number
    gapAllowance: number
    matchScore: number

    useSubmissionAsReference: boolean

    threshold: string
}

const defaultCompareOptions: CompareOptions = {
    minWordCount: 1,
    gapAllowance: 0,
    matchScore: 85,
    useSubmissionAsReference: true,
    threshold: '> 3'
}

const parseIdentifier = parseUsableLinkIdentifier();

const getActivityIdentifier = (activity: (Post | Comment), length = 200) => {
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

const condenseActivities = (activities: (Post | Comment)[], opts: CompareOptions) => activities.reduce(async (accProm: Promise<RepeatActivityReducer>, activity: (Post | Comment), index: number) => {
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

Devvit.addTrigger({
    event: Devvit.Trigger.PostSubmit,
    async handler(request: PostSubmit, metadata?: Metadata) {
        const {
            author: {
                name
            } = {},
            post: postv2,
        } = request;
        if (name !== undefined && postv2 !== undefined) {

            const opts: CompareOptions = {...defaultCompareOptions};

            const post = await reddit.getPostById(postv2.id);
            const posts = await reddit.getPostsByUser({username: name, sort: 'new', pageSize: 100, limit: 100}).all();

            const hasSubmitted = posts.some(x => x.id === post.id);
            if (!hasSubmitted) {
                posts.push(post);
            }

            posts.sort((a, b) => {
                return a.createdAt.getTime() - b.createdAt.getTime()
            });

            const condensedActivities = await condenseActivities(posts, opts);

            const allRepeatSets = [...condensedActivities.allSets, ...condensedActivities.openSets];

            const identifierGroupedActivities = allRepeatSets.reduce((acc, repeatActivityData) => {
                let existingSets = [];
                if (acc.has(repeatActivityData.identifier)) {
                    existingSets = acc.get(repeatActivityData.identifier);
                }
                acc.set(repeatActivityData.identifier, [...existingSets, repeatActivityData.sets].sort((a, b) => b.length < a.length ? 1 : -1));
                return acc;
            }, new Map());

            let applicableGroupedActivities = identifierGroupedActivities;

            if (opts.useSubmissionAsReference) {
                applicableGroupedActivities = new Map();
                let identifier = getActivityIdentifier(post);
                // look for exact match first
                let referenceSubmissions = identifierGroupedActivities.get(identifier);
                if (referenceSubmissions === undefined) {
                    if (isExternalUrlSubmission(post)) {
                        // if external url sub then try by title
                        identifier = post.title;
                        referenceSubmissions = identifierGroupedActivities.get(identifier);
                        if (referenceSubmissions === undefined) {
                            // didn't get by title so go back to url since that's the default
                            identifier = getActivityIdentifier(post);
                        }
                    } else if (asPost(post) && post.body !== undefined) {
                        // if is self post then identifier is made up of title and body so identifiers may not be *exact* if title varies or body varies
                        // -- try to find identifying sets by using string sameness on set identifiers
                        let fuzzySets: (Post | Comment)[] = [];
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

            const {operator, value: thresholdValue} = parseGenericValueComparison(opts.threshold);
            const greaterThan = operator.includes('>');
            let allLessThan = true;

            const identifiersSummary: SummaryData[] = [];
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
                    const test = comparisonTextOp(set.length, operator, thresholdValue);
                    const md = set.map((x: (Comment | Post)) => `${asPost(x) ? x.title : getActivityIdentifier(x, 50)} in ${asPost(x) ? x.subredditName : x.parentId} on ${x.createdAt.toISOString()}`);

                    summaryData.sets.push(set);
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

            const criteriaMet = identifiersSummary.filter(x => x.totalTriggeringSets > 0).length > 0 && (greaterThan || (!greaterThan && allLessThan));

            const largestRepeat = identifiersSummary.reduce((acc, summ) => Math.max(summ.largestTrigger, acc), 0);
            let result: string;
            if (criteriaMet || greaterThan) {
                result = `${criteriaMet ? PASS : FAIL} ${identifiersSummary.filter(x => x.totalTriggeringSets > 0).length} of ${identifiersSummary.length} unique items repeated ${opts.threshold} times, largest repeat: ${largestRepeat}`;
            } else {
                result = `${FAIL} Not all of ${identifiersSummary.length} unique items repeated ${opts.threshold} times, largest repeat: ${largestRepeat}`
            }

            console.log(result);

            if (criteriaMet) {
                const triggeringSummaries = identifiersSummary.filter(x => x.totalTriggeringSets > 0);
                // remove activity
                await reddit.remove(post.id, false, metadata);
            }
        }
    },
});

export default Devvit;
