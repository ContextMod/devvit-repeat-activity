import {Comment, ContextActionsBuilder, Devvit, Post, RedditAPIClient} from '@devvit/public-api';

import {Metadata, PostSubmit, CommentSubmit} from '@devvit/protos';
import {Activity, CompareOptions, FAIL, PASS, RepeatCheckResult, SummaryData} from "./Atomic.js";
import {
    condenseActivities,
    extractApplicableGroupedActivities,
    generateResult,
    getActivityIdentifier
} from "./funcs.js";

const reddit = new RedditAPIClient();

const defaultCompareOptions: CompareOptions = {
    minWordCount: 1,
    gapAllowance: 0,
    matchScore: 85,
    useSubmissionAsReference: true,
    threshold: '> 3'
}

Devvit.ContextAction.onGetActions(async () => {
    return new ContextActionsBuilder()
        .action({
            actionId: 'removeIfRepeat',
            name: 'Remove If Repeated',
            description: 'Remove activity if repeated more than 3 times',
            post: true,
            comment: true,
            moderator: true,
        })
        .action({
            actionId: 'checkRepeat',
            name: `Check For Repeats`,
            description: 'Tells you largest of repeats found for this content',
            post: true,
            comment: true,
            moderator: true,
        })
        .build();
});

Devvit.ContextAction.onAction(async (action, metadata) => {
    let obj: Activity;
    if (action.post !== undefined) {
        obj = await reddit.getPostById(`t3_${action.post.id}` as string);
    } else if (action.comment !== undefined) {
        obj = await reddit.getCommentById(`t1_${action.comment.id}` as string);
    } else {
        return {success: false, message: 'Must be run on a Post or Comment'};
    }
    const results = await getRepeatCheckResult(obj);

    switch (action.actionId) {
        case 'checkRepeat':
            return {
                success: true,
                message: results.result
            }
        case 'removeIfRepeat':
            if (results.triggered) {
                await reddit.remove(obj.id, false, metadata);
            }
            return {
                success: true,
                message: `${results.triggered} ? 'REMOVED => ' : 'NOT REMOVED => '${results.result}`
            };
        default:
            return {success: false, message: 'Invalid action'};
    }
});

const getRepeatCheckResult = async (item: Activity): Promise<RepeatCheckResult> => {

    const opts: CompareOptions = {...defaultCompareOptions};

    const posts = await reddit.getPostsByUser({
        username: item.authorName,
        sort: 'new',
        pageSize: 100,
        limit: 100
    }).all();
    const comments = await reddit.getCommentsByUser({
        username: item.authorName,
        sort: 'new',
        pageSize: 100,
        limit: 100
    }).all();
    const allActivities: Activity[] = [...posts, ...comments];

    const hasSubmitted = allActivities.some(x => x.id === item.id);
    if (!hasSubmitted) {
        allActivities.push(item);
    }

    allActivities.sort((a, b) => {
        return a.createdAt.getTime() - b.createdAt.getTime()
    });

    const condensedActivities = await condenseActivities(allActivities, opts);
    const applicableGroupedActivities = extractApplicableGroupedActivities(condensedActivities, opts, opts.useSubmissionAsReference ? item : undefined)
    return generateResult(applicableGroupedActivities, opts);
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

            const itemId = `t3_${postv2.id}`;
            const item = await reddit.getPostById(itemId);
            const results = await getRepeatCheckResult(item);

            if (results.triggered) {
                // remove activity
                await reddit.remove(itemId, false, metadata);
            }
        }
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.CommentSubmit,
    async handler(request: CommentSubmit, metadata?: Metadata) {
        const {
            author: {
                name
            } = {},
            comment: commentv2,
        } = request;
        if (name !== undefined && commentv2 !== undefined) {

            const opts: CompareOptions = {...defaultCompareOptions};

            const itemId = `t1_${commentv2.id}`;
            const item = await reddit.getPostById(itemId);
            const results = await getRepeatCheckResult(item);

            if (results.triggered) {
                // remove activity
                await reddit.remove(itemId, false, metadata);
            }
        }
    },
});

export default Devvit;
