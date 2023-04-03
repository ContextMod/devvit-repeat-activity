import {Comment, Devvit, Post, RedditAPIClient} from '@devvit/public-api';

import {Metadata, PostSubmit,} from '@devvit/protos';
import {
    asPost,
    comparisonTextOp,
    isExternalUrlSubmission,
    parseGenericValueComparison,
    stringSameness,
} from "./utils/utils.js";
import {CompareOptions, FAIL, PASS, SummaryData} from "./Atomic.js";
import {condenseActivities, extractApplicableGroupedActivities, getActivityIdentifier} from "./funcs.js";

const reddit = new RedditAPIClient();

const defaultCompareOptions: CompareOptions = {
    minWordCount: 1,
    gapAllowance: 0,
    matchScore: 85,
    useSubmissionAsReference: true,
    threshold: '> 3'
}

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
            const applicableGroupedActivities = extractApplicableGroupedActivities(condensedActivities, opts, opts.useSubmissionAsReference ? post : undefined)

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
                    const md = `${getActivityIdentifier(set[0], 50)} ${set.length === 1 ? 'found once' : `repeated ${set.length}x`} in ${set.map(x => `${asPost(x) ? x.title : x.parentId}`).join(', ')}`;

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
